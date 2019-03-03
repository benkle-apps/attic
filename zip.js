const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

exports.it = (output, directory, files) => {
    return new Promise((resolve, reject) => {
        let outStream = fs.createWriteStream(output);
        let archive = archiver('zip', {
            zlib: {level: 9}
        });

        outStream.on('close', () => resolve(output));
        archive.on('warning', error => {
            if (error.code !== 'ENOENT') {
                reject(error);
            }
        });
        archive.on('error', reject);
        archive.pipe(outStream);

        files.forEach(file => {
            let absFile = path.resolve(path.join(directory, file));
            archive.file(absFile, {name: file});
        });

        archive.finalize();

    });
};