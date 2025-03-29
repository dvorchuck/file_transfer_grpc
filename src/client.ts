import * as grpc from "@grpc/grpc-js";
import {
  FileServiceClient,
  FileRequest,
  FileResponse,
} from "../proto/transfer";
import { gatherFileData } from "./file";
import path from "path";
import { createWriteStream, WriteStream, promises as fsPromises } from "fs";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";

const STORAGE_PATH_CLIENT = path.resolve("storage-client");
console.log("STORAGE_PATH_CLIENT", STORAGE_PATH_CLIENT);

async function main() {
  const writeStreamsMap = new Map<string, WriteStream | false>();
  // data prep
  const fileData = await gatherFileData(STORAGE_PATH_CLIENT);
  console.log("fileData", fileData);

  const request: FileRequest = {
    info: fileData,
  };

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
    let stream = writeStreamsMap.get(response.path);

    if (!stream) {
      if (stream === false) {
        throw new Error(
          `Server sent second buffer, but the first buffer said the files are same. Path: ${response.path}`
        );
      }
      // empty buffer in the first message means the files are same > don't start the write stream
      if (response.data.length === 0) {
        writeStreamsMap.set(response.path, false);
        return;
      }

      const newPath = path.resolve(STORAGE_PATH_CLIENT, response.path);
      await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
      stream = createWriteStream(newPath, { encoding: "binary" });
      writeStreamsMap.set(response.path, stream);
    }

    stream.write(response.data);
  });

  stream.on("end", () => {
    console.log(
      `streaming (communication + write) completed in ${
        performance.now() - startTime
      }ms`
    );
    for (const file of fileData) {
      if (!writeStreamsMap.has(file.path)) {
        const newPath = path.resolve(STORAGE_PATH_CLIENT, file.path);
        fsPromises.rm(newPath);
      }
    }

    for (const [path, writeStream] of writeStreamsMap) {
      if (!writeStream) {
        continue;
      }
      writeStream.end();
    }

    writeStreamsMap.clear();
    console.log("File sync completed.");
    console.log(`completed in ${performance.now() - startTime}ms`);
  });

  stream.on("error", (err) => {
    console.error("stream error:", err);
  });
}

main();
