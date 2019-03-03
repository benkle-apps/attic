const fs = require('fs');
const path = require('path');
const mime = require('mime');
const slugify = require('slugify');

/**
 * I wish anglos would learn at least that...
 */
slugify.extend({
    'ä': 'ae',
    'ö': 'oe',
    'ü': 'ue',
    'Ä': 'Ae',
    'Ö': 'Oe',
    'Ü': 'Ue',
    'ß': 'sz',
    'ẞ': 'SZ',
});

const stat = (path, options) => {
    return new Promise((resolve, reject) => {
        fs.stat(...[path, options, (error, stats) => error ? reject(error) : resolve({path, stats})].filter(e => !!e));
    });
};



class INode {
    constructor(base, parents, name) {
        this.base = base;
        this.parents = parents;
        this.name = name;
    }

    get absolutePath() {
        return path.join(...[this.base].concat(this.parents, [this.name]));
    }

    get slug() {
        return slugify(this.name, {lower: true});
    }
}

class File extends INode {
    constructor(base, parents, name, stats = false) {
        super(base, parents, name);
        this.stats = stats;
    }

    reStat() {
        return new Promise((resolve, reject) => fs.stat(this.absolutePath, (error, stats) => {
            if (error) {
                reject(error);
            } else {
                this.stats = stats;
                resolve(this);
            }
        }));
    }

    read(processor = null, encoding = 'utf8') {
        return new Promise((resolve, reject) => {
            fs.readFile(this.absolutePath, {encoding},
                (error, content) => error ? reject(error) : resolve(processor ? processor(content) : content)
            );
        });
    }

    write(content, mode = 0o666, encoding = 'utf8') {
        return new Promise((resolve, reject) => fs.writeFile(
            this.absolutePath,
            content,
            {encoding, mode},
            error => error ? reject(error) : resolve(this)
        ));
    }

    linkTo(target) {
        return new Promise((resolve, reject) => {
            if (target instanceof File) {
                target = path.relative(path.dirname(this.absolutePath), target.absolutePath);
            }
            fs.symlink(target, this.absolutePath, error => error ? reject(error) : resolve(this));
        });
    }

    delete() {
        return new Promise((resolve, reject) => fs.unlink(this.absolutePath, (error) => error ? reject(error) : resolve(this)));
    }

    get mime() {
        return mime.getType(this.absolutePath);
    }
}

class Directory extends INode {
    open(name) {
        return new File(this.base, this.parents.concat([this.name]), name);
    }

    mkdir(name = null) {
        let directory = name ? new Directory(this.base, this.parents.concat([this.name]), name) : this;
        return new Promise((resolve, reject) => {
            fs.mkdir(directory.absolutePath, e => (!e || (e && e.code === 'EEXIST')) ? resolve(directory) : reject(e));
        });
    }

    clear() {
        return this.list()
            .then(items => {
                let promises = [];
                items.forEach(item => {
                    if (item instanceof File) {
                        promises.push(item.delete());
                    } else if (item instanceof Directory) {
                        promises.push(item.clear().then(item => item.delete()));
                    }
                });
                return Promise.all(promises).then(e => this);
            });
    }

    delete() {
        return new Promise((resolve, reject) => fs.rmdir(this.absolutePath, (error) => error ? reject(error) : resolve(this)));
    }

    list() {
        return new Promise((resolve, reject) => {
            let directory = this.absolutePath;
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

exports.INode = INode;
exports.Directory = Directory;
exports.File = File;