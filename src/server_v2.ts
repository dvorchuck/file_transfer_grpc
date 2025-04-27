import * as grpc from "@grpc/grpc-js";
import * as path from "path";
import {
  Action,
  FileServiceServer,
  FileServiceService,
} from "../proto/transfer_v2";
import { gatherFileData, getFolders } from "./file";
import { fsService } from "./read.service";

const STORAGE_PATH_SERVER = path.resolve("storage-server");
const storageMap = new Map<string, Map<string /**path */, string> /**hash */>();
console.log("STORAGE_PATH_SERVER", STORAGE_PATH_SERVER);

async function main() {
  // in startup prep
  const storages = await getFolders(STORAGE_PATH_SERVER);
  await Promise.all(
    storages.map(async (storage) => {
      storageMap.set(
        storage,
        await gatherFileData(path.resolve(STORAGE_PATH_SERVER, storage))
      );
    })
  );

  console.log("storages", storages);
  // start server
  const server: FileServiceServer = {
    syncFiles: async (call) => {
      const startTime = performance.now();
      console.log("-----------------------");
      console.log(
        `Received file sync request for metadata: ${JSON.stringify(
          call.metadata
        )} and payload: ${JSON.stringify(call.request.info)}`
      );

      const clientName = call.metadata.get("clientId")[0];
      // use of metadata:
      // https://grpc.io/docs/guides/metadata/
      // "gRPC metadata is a key-value pair of data that is sent with initial or final gRPC requests or responses. It is used to provide additional information about the call, such as authentication credentials, tracing information, or custom headers."

      if (!clientName || typeof clientName !== "string") {
        console.error(
          `Expected clientId as a stirng in metadata. Received: ${clientName.toString()}`
        );

        // inspired from https://github.com/grpc/grpc-node/blob/master/examples/error_handling/server.js
        call.emit("error", {
          code: grpc.status.INVALID_ARGUMENT, // for detailed erorr handling check other enumerations in grpc.status (for example UNAUTHENTICATED)
          details: "request missing required metadata field: clientName",
        });
        call.end();
        return;
      }

      const storage = path.resolve(STORAGE_PATH_SERVER, clientName);
      const fileDataMap = storageMap.get(clientName) ?? new Map();

      const toBeDeleted = call.request.info.filter(
        (incoming) => !fileDataMap.has(incoming.path)
      );

      // to delete
      for (const file of toBeDeleted) {
        call.write({
          path: file.path,
          action: Action.DELETE,
        });
      }

      const startSending = performance.now();

      const promises: Promise<void>[] = [];
      fileDataMap.forEach(async (hash, filePath) => {
        const fileStart = performance.now();
        const fullPath = path.resolve(storage, filePath);

        const incomingHash = call.request.info.find(
          (file) => file.path === filePath
        )?.hash;

        // files are matching
        if (incomingHash && hash === incomingHash) {
          call.write({
            path: filePath,
            action: Action.KEEP,
          });

          return;
        }

        // files are different, or do not exists
        const promise = new Promise<void>(async (resolve, reject) => {
          const fileStream = (await fsService.getReadStream(fullPath))
            // todo: empty file handling
            .on("data", (data) => {
              call.write({
                path: filePath,
                data: data as Buffer,
              });
            })
            .once("end", () => {
              call.write({
                path: filePath,
                action: Action.COMPLETE,
              });
            });

          fileStream
            .on("end", () => {
              console.log(
                `file "${filePath}" took ${performance.now() - fileStart}ms`
              );
              resolve();
            })
            .on("error", reject);
        });
        promises.push(promise);
      });

      await Promise.all(promises);

      console.log(
        `only sending data took ${performance.now() - startSending}ms`
      );
      console.log(`Response finished in ${performance.now() - startTime}ms`);

      call.end();
    },
  };

  const grpcServer = new grpc.Server();
  grpcServer.addService(FileServiceService, server);

  grpcServer.bindAsync(
    "127.0.0.1:50051",
    grpc.ServerCredentials.createInsecure(),
    () => {
      console.log("Server running on port 50051");
    }
  );
}

main();
