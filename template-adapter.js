class Adapter {
    constructor(options) {
        this.options = options;
    }

    render(vars) {
        return 'TEST CLASS';
    }
}

exports.Adapter = Adapter;

exports.create = function(options) {
    return new Adapter(options);
};