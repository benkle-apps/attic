const fso = require('./fs-objects');
const path = require('path');
const match = require('minimatch');
const YAML = require('yaml');
const zip = require('./zip');

const either = (a, b) => [null, undefined].includes(a) ? b : a;

const expandGlobList = (base, addition) =>
    base
        .concat(either(addition, []))
        .filter(item => item instanceof String || typeof item === 'string')
    ;

const extendConfig = (dir, options) => {
    return new Promise((resolve, reject) => {
        dir
            .open('directory.yaml')
            .read(content => YAML.parse(content).options)
            .then(directoryOptions => {
                options.index = either(directoryOptions.index, options.index);
                options.icon = either(directoryOptions.icon, options.icon);
                if (directoryOptions.zip) {
                    options.zip.enabled = either(directoryOptions.zip.enabled, options.zip.enabled);
                    options.zip.exclude = expandGlobList(options.zip.exclude, directoryOptions.zip.exclude);
                    options.zip.include = expandGlobList(options.zip.include, directoryOptions.zip.include);
                }
                if (directoryOptions.listing) {
                    options.listing.exclude = expandGlobList(options.listing.exclude, directoryOptions.listing.exclude);
                    options.listing.include = expandGlobList(options.listing.include, directoryOptions.listing.include);
                }
                options.static = expandGlobList(options.static, directoryOptions.static);
                resolve(options);
            })
            .catch(e => {
                console.log(e);
                resolve(options);
            });
    });
};

const processDir = (fromDir, toDir, baseConfig) => {
    let options = JSON.parse(JSON.stringify(baseConfig.options));
    extendConfig(fromDir, options)
        .then(options => Promise.all([Promise.resolve(options), fromDir.list()]))
        .then(result => {
            [options, items] = result;
            let data = {
                site: {
                    name: baseConfig.name,
                },
                name: fromDir.name,
                parents: fromDir.parents.map((parent, index, parents) => {
                    let name = parent ? parent : baseConfig.root;
                    let dots = new Array(parents.length - index);
                    return {
                        display: name,
                        slug: dots.fill('..').join('/'),
                    };
                }),
                directories: [],
                files: [],
                listed: [],
                zip: options.zip.enabled ? [] : false,
                text: '',
            };
            let promises = items.map(item => {
                let promises = [];
                if (item instanceof fso.Directory) {
                    promises.push(toDir
                        .mkdir(item.slug)
                        .then(dir => {
                            data.directories.push({
                                display: item.name,
                                slug: dir.name,
                                icon: baseConfig.options.icon,
                            });
                            return dir;
                        })
                        .then(dir => processDir(item, dir, baseConfig))
                    );
                } else {
                    const vote = (name, globs) => {
                        globs = globs.map(glob => match(name, glob));
                        globs = globs.reduce((a, c) => a || c, false);
                        return globs;
                    };

                    let isStatic = vote(item.name, options.static);

                    let isListingIncluded = vote(item.name, options.listing.include);
                    let isListingExcluded = vote(item.name, options.listing.exclude);
                    let isListed = isListingIncluded || !isListingExcluded;

                    let isZipIncluded = vote(item.name, options.zip.include);
                    let isZipExcluded = vote(item.name, options.zip.exclude);

                    if (options.zip.enabled && (isZipIncluded || (isListed && !isZipExcluded))) {
                        data.zip.push(item.name);
                    }

                    if (isStatic || isListed) {
                        promises.push(toDir
                            .open(item.slug)
                            .linkTo(item)
                            .then(link => {
                                let templateData = {
                                    display: item.name,
                                    slug: link.name,
                                    type: item.mime,
                                };
                                data.files.push(templateData);
                                if (isListed) {
                                    data.listed.push(templateData);
                                }
                            })
                        );
                    } else {
                        promises.push(Promise.resolve());
                    }

                    if (item.name === options.index) {
                        promises.push(item.read().then(text => data.text = baseConfig.compilers.text.render(text)));
                    }
                }
                return Promise.all(promises);
            });
            return Promise.all(promises).then(_ => data);
        })
        .then(data => {
            if (data.zip && data.zip.length) {
                let zipFile = toDir.open(toDir.name + '.zip');
                return zip
                    .it(zipFile.absolutePath, fromDir.absolutePath, data.zip)
                    .then(_ => {
                        data.zip = zipFile.name;
                        return data;
                    });
            } else {
                return data;
            }
        })
        .then(data => {
            if (baseConfig.json) {
                return toDir
                    .open('index.json')
                    .write(JSON.stringify(data))
                    .then(_ => data);
            } else {
                return data;
            }
        })
        .then(data => {
            return toDir
                .open('index.html')
                .write(baseConfig.compilers.template.render(data));
        });
    ;
};

process.argv.slice(2).forEach(function(configFile) {
    let absConfigFile = path.parse(path.resolve(configFile));

    new fso.File(absConfigFile.dir, [], absConfigFile.base)
        .reStat()
        .then(cfgFile => cfgFile.read(content => YAML.parse(content)))
        .then(config => {
            let compilers = config.project.compilers;

            let adapter = require(compilers.template.adapter);
            compilers.template = adapter.create(absConfigFile.dir, compilers.template.options);

            if (compilers.text) {
                adapter = require(compilers.text.adapter);
                compilers.text = adapter.create(absConfigFile.dir, compilers.text.options);
            } else {
                compilers.text = text => text;
            }

            let fromDir = new fso.Directory(path.join(absConfigFile.dir, config.project.input), [], '');
            let toDir = new fso.Directory(path.join(absConfigFile.dir, config.project.output), [], '');
            toDir
                .mkdir()
                .then(outputDir => outputDir.clear())
                .then(outputDir => processDir(fromDir, outputDir, config.project))
        })
    ;
});
