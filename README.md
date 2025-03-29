# file_transfer_grpc

## TODO

- when calling with all files already synched, the completion time is still high

## Startup

- run `npm run start:server`
- run `npm run start:client` in other command line to start the file synchronization.
- Files are stored in `storage-client` and `storage-server`. Feel free to change the files to try the behavior.

The synchronization does not listen to changes in the file system. You neeed to run `npm run start:client` again to sync again.

## Potential improvements

- delete empty folders in client after syncing (currently only files are deleted and not the folders)
- code cleanup + logging
- error handling
- add update file endpoint so the files in server can be changed (upsert/delete)
- client internal service (non-grpc) that listens to the client storage and based on changes sends the updates to server
- server should gatherFileData on startup for each file (not on every request)

### v2 proto should solve:

- stop write stream when no data would be recieved (instead of waiting for the end of communication)
- receive delete info right away to start deleting early (instead of waiting for the end of communication)
- add keep information instead of the magical empty buffer

## Sources

grpc-node examples
[https://github.com/grpc/grpc-node/tree/master/examples]()
