class Adapter {
    constructor(directory, options) {
        this.options = options;
        this.directory = directory;
    }

    render(vars) {
        return '';
    }
}

exports.Adapter = Adapter;

exports.create = function(directory, options) {
    return new Adapter(directory, options);
};