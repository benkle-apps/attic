const fso = require('./fs-objects');
const path = require('path');

const processDir = (fromDir, toDir) => {
    fromDir.list()
        .then(items => {
            items.forEach(item => {
                if (item instanceof fso.Directory) {
                    toDir.mkdir(item.slug).then(toDir => processDir(item, toDir));
                } else {
                    toDir.open(item.slug).linkTo(item);
                }
            });
        });
};

[from, to] = process.argv.slice(2, 4);

fromDir = new fso.Directory(path.join(process.cwd(), from), [], '');
toDir = new fso.Directory(path.join(process.cwd(), to), [], '');
toDir
    .mkdir()
    .then(outputDir => outputDir.clear())
    .then(outputDir => processDir(fromDir, outputDir))
;