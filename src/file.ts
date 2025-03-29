import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export async function gatherFileData(
  dirPath: string,
  basePath: string = dirPath
): Promise<{ path: string; hash: string }[]> {
  const fileHashes: { path: string; hash: string }[] = [];

  // Get all files and directories in the current directory
  const filesAndDirs = await fs.promises.readdir(dirPath, {
    withFileTypes: true,
  });

  // Iterate over each item
  for (const fileOrDir of filesAndDirs) {
    const fullPath = path.join(dirPath, fileOrDir.name);
    const relativePath = path.relative(basePath, fullPath);

    if (fileOrDir.isDirectory()) {
      // If it's a directory, recursively process it
      const nestedHashes = await gatherFileData(fullPath, basePath);
      fileHashes.push(...nestedHashes);
    } else if (fileOrDir.isFile()) {
      // If it's a file, calculate its hash
      const hash = await calculateFileHash(fullPath);
      fileHashes.push({ path: relativePath, hash });
    }
  }

  return fileHashes;
}

export async function calculateFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fileStream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    fileStream.on("data", (data) => {
      hash.update(data);
    });

    fileStream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    fileStream.on("error", (err) => {
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
