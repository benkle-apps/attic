const fs = require('fs');
const path = require('path');
const mime = require('mime');

const stat = (path, options) => {
    return new Promise((resolve, reject) => {
        fs.stat(...[path, options, (error, stats) => {
            if (error) {
                reject(error);
            } else {
                resolve({path, stats});
            }
        }].filter(e => !!e));
    });
};



class INode {
    constructor(base, parents, name) {
        this.base = base;
        this.parents = parents;
        this.name = name;
    }

    getAbsolutePath() {
        return path.join(...[this.base].concat(this.parents, [this.name]));
    }
}

class File extends INode {
    constructor(base, parents, name, stats) {
        super(base, parents, name);
        if (stats instanceof fs.Stats) {
            this.stats = stats;
        } else {
            fs.stat(this.getAbsolutePath(), (error, stats) => this.stats = stats);
        }
    }

    read(encoding = 'utf8') {
        return new Promise((resolve, reject) => {
            fs.readFile(this.getAbsolutePath(), {encoding}, (error, content) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(content);
                }
            });
        });
    }

    mime() {
        return mime.getType(this.getAbsolutePath());
    }
}

class Directory extends INode {

    list() {
        return new Promise((resolve, reject) => {
            let directory = this.getAbsolutePath();
            fs.readdir(directory, (error, files) => {
                if (error) {
                    reject(error);
                } else {
                    Promise
                        .all(files.map(file =>
                            stat(path.join(directory, file))
                                .then(result => {
                                    let parents = this.parents.concat([this.name]);
                                    if (result.stats.isDirectory()) {
                                        return new Directory(this.base, parents, file);
                                    } else {
                                        return new File(this.base, parents, file, result.stats);
                                    }
                                })
                        ))
                        .then(resolve)
                }
            });
        });
    }
}

exports.Directory = Directory;
exports.File = File;