import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fsService } from "./read.service";

export async function gatherFileData(
  dirPath: string
): Promise<Map<string, string>> {
  const startTime = performance.now();
  /** key: path, value: hash */
  const fileHashes = new Map<string, string>();

  async function recursion(dirPath: string, basePath: string = dirPath) {
    const filesAndDirs = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });

    return Promise.all(
      filesAndDirs.map(async (fileOrDir) => {
        // Iterate over each item
        const fullPath = path.join(dirPath, fileOrDir.name);
        const relativePath = path.relative(basePath, fullPath);

        if (fileOrDir.isDirectory()) {
          // If it's a directory, recursively process it
          return recursion(fullPath, basePath);
        } else if (fileOrDir.isFile()) {
          // If it's a file, calculate its hash
          const hash = await calculateFileHash(fullPath);
          fileHashes.set(relativePath, hash);
        }
      })
    );
  }

  await recursion(dirPath);
  // Get all files and directories in the current directory

  console.log(`gatherFileData took: ${performance.now() - startTime}ms`);
  return fileHashes;
}

export async function calculateFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fileStream = await fsService.getReadStream(filePath);

  return new Promise((resolve, reject) => {
    fileStream.on("data", (data) => {
      hash.update(data);
    });

    fileStream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    fileStream.on("error", (err) => {
      console.error(err);
      reject(err);
    });
  });
}

export async function getFolders(directoryPath: string) {
  return fs.promises.readdir(directoryPath).then((files) => {
    return files.filter((file) =>
      fs.statSync(path.join(directoryPath, file)).isDirectory()
    );
  });
}
