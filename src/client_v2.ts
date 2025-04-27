import * as grpc from "@grpc/grpc-js";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";
import { promises as fsPromises, WriteStream } from "fs";
import path from "path";
import {
  Action,
  FileRequest,
  FileResponse,
  FileServiceClient,
} from "../proto/transfer_v2";
import { gatherFileData } from "./file";
import { fsService } from "./read.service";

const STORAGE_PATH_CLIENT = path.resolve("storage-client");
console.log("STORAGE_PATH_CLIENT", STORAGE_PATH_CLIENT);

async function main() {
  const writeStreamsMap = new Map<string, Promise<WriteStream>>();
  // data prep
  const fileData = await gatherFileData(STORAGE_PATH_CLIENT);
  console.log("fileData", fileData);

  const request: FileRequest = {
    info: [],
  };

  fileData.forEach((value, key) => {
    request.info.push({
      path: key,
      hash: value,
    });
  });

  // client
  const client = new FileServiceClient(
    "localhost:50051",
    grpc.credentials.createInsecure(),
    { "grpc.default_compression_algorithm": CompressionAlgorithms.gzip }
  );

  // for advanced metadata handling see https://github.com/grpc/grpc-node/blob/master/examples/metadata/client.js
  const metadata = new grpc.Metadata();
  metadata.set("clientId", "client-12345"); // This is a custom metadata field
  metadata.set("authToken", "secretToken");

  const startTime = performance.now();
  const stream = client.syncFiles(request, metadata);

  stream.on("data", async (response: FileResponse) => {
    if (response.action === Action.KEEP) {
      return;
    }

    if (response.action === Action.DELETE) {
      const newPath = path.resolve(STORAGE_PATH_CLIENT, response.path);
      fsPromises.rm(newPath);
      return;
    }

    if (response.action === Action.COMPLETE) {
      (await writeStreamsMap.get(response.path))?.close();
      return;
    }

    let stream = writeStreamsMap.get(response.path);

    if (!stream) {
      const newPath = path.resolve(STORAGE_PATH_CLIENT, response.path);
      // since fs.promises.mkdir is a promise, another data could be processed during the wait causing a double createWriteStream and corrupting data
      // thats why the map holds writeStreams wrapped in promises. so all the on data will wait and won't create duplicates nor will try to write before the promise resolving.
      // - also we dont want to block the stream by sync version of the mkdir. That would make doing multiple mkdir concurrently impossible.
      stream = fsPromises
        .mkdir(path.dirname(newPath), { recursive: true })
        .then(async () =>
          (await fsService.getWriteStream(newPath)).on("close", () =>
            console.log(`closed: ${response.path}`)
          )
        );
      console.log(`creating a new write stream: ${response.path}`);
      writeStreamsMap.set(response.path, stream);
    }

    (await stream).write(response.data);
  });

  stream.on("error", (err) => {
    console.error("stream error:", err);
  });
}

main();
