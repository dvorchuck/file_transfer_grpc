import {
  createReadStream,
  createWriteStream,
  ReadStream,
  WriteStream,
} from "fs";

/** max number of open read file sockets*/
const DEFAULT_LIMIT = 100;

class FileService {
  private limit: number = DEFAULT_LIMIT;
  private running: number = 0;
  private queue: Function[] = [];

  constructor(limit: number = DEFAULT_LIMIT) {
    this.limit = limit;
  }

  private next() {
    this.running--;
    if (!this.queue.length) {
      return;
    }

    this.running++;
    const task = this.queue.shift();
    task?.();
  }

  private async waitForTurn() {
    if (this.running < this.limit) {
      this.running++;
    } else {
      await new Promise((res) => {
        this.queue.push(res);
      });
    }
  }

  public async getReadStream(filePath: string): Promise<ReadStream> {
    await this.waitForTurn();

    return createReadStream(filePath).once("end", () => this.next());
  }

  public async getWriteStream(filePath: string): Promise<WriteStream> {
    await this.waitForTurn();

    return createWriteStream(filePath).once("end", this.next.bind(this));
  }
}

export const fsService = new FileService();
