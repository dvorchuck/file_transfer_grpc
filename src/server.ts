import * as grpc from "@grpc/grpc-js";
import * as fs from "fs";
import { FileServiceService, FileServiceServer } from "../proto/transfer";
import path from "path";
import { gatherFileData } from "./file";

const STORAGE_PATH_SERVER = path.resolve("storage-server");

const server: FileServiceServer = {
  syncFiles: async (call) => {
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

    const startTimeGatherFileData = performance.now();
    const fileDataList = await gatherFileData(storage);
    console.log(
      `gatherFileData took ${performance.now() - startTimeGatherFileData}ms`
    );

    const startSending = performance.now();
    await Promise.all(
      fileDataList.map((fileData) => {
        const fullPath = path.resolve(storage, fileData.path);

        const incomingHash = call.request.info.find(
          (file) => file.path === fileData.path
        )?.hash;

        // files are matching
        if (incomingHash && fileData.hash === incomingHash) {
          call.write({
            path: fileData.path,
            data: Buffer.alloc(0),
          });

          return;
        }

        // files are different, or do not exists
        const fileStream = fs.createReadStream(fullPath);

        return new Promise<void>((resolve, reject) => {
          fileStream.on("data", (data) => {
            call.write({
              path: fileData.path,
              data: data as Buffer,
            });
          });

          fileStream.on("end", resolve);
          fileStream.on("error", reject);
        });
      })
    );
    console.log(`only sending data took ${performance.now() - startSending}ms`);

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
