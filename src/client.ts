import * as grpc from "@grpc/grpc-js";
import {
  FileServiceClient,
  FileRequest,
  FileResponse,
} from "../proto/transfer";
import { gatherFileData } from "./file";
import path from "path";
import { createWriteStream, WriteStream, promises as fsPromises } from "fs";

const STORAGE_PATH_CLIENT = path.resolve("storage-client");
console.log("STORAGE_PATH_CLIENT", STORAGE_PATH_CLIENT);

async function main() {
  const writeStreamsMap = new Map<string, WriteStream>();
  // data prep
  const fileData = await gatherFileData(STORAGE_PATH_CLIENT);
  console.log("fileData", fileData);

  const request: FileRequest = {
    info: fileData,
  };

  // client
  const client = new FileServiceClient(
    "localhost:50051",
    grpc.credentials.createInsecure()
  );

  const metadata = new grpc.Metadata();
  metadata.set("clientId", "client-12345"); // This is a custom metadata field
  metadata.set("authToken", "secretToken");

  const stream = client.syncFiles(request, metadata);

  stream.on("data", async (response: FileResponse) => {
    let stream = writeStreamsMap.get(response.path);

    if (!stream) {
      const newPath = path.resolve(STORAGE_PATH_CLIENT, response.path);
      console.log("newPath", newPath);
      await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
      stream = createWriteStream(newPath, { encoding: "binary" });
      writeStreamsMap.set(response.path, stream);
    }

    stream.write(response.data);
  });

  stream.on("end", () => {
    for (const file of fileData) {
      if (!writeStreamsMap.has(file.path)) {
        const newPath = path.resolve(STORAGE_PATH_CLIENT, file.path);
        fsPromises.rm(newPath);
      }
    }

    for (const [, writeStream] of writeStreamsMap) {
      writeStream.end();
    }

    writeStreamsMap.clear();
    console.log("File sync completed.");
  });

  stream.on("error", (err) => {
    console.error("stream error:", err);
  });
}

main();
