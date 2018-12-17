/*
 * Copyright (c) 2011 Vinay Pulim <vinay@milewise.com>
 * MIT Licensed
 */

function findKey(obj, val) {
    for (var n in obj)
        if (obj[n] === val) return n;
}

var http = require('./http'),
    assert = require('./assert'),
    url = require('./url');

var Client = function (wsdl, options) {
    this.wsdl = wsdl;
    if (options) {
        this._initializeServices(options);
    }

}

Client.prototype.setEndpoint = function (options) {
    this.options = options;
    this._initializeServices(options);
}

Client.prototype.describe = function () {
    var types = this.wsdl.definitions.types;
    return this.wsdl.describeServices();
}

Client.prototype.setSecurity = function (security) {
    this.security = security;
}

Client.prototype.setSOAPAction = function (SOAPAction) {
    this.SOAPAction = SOAPAction;
}

Client.prototype._initializeServices = function (options) {
    var definitions = this.wsdl.definitions,
        services = definitions.services;
    for (var name in services) {
        this[name] = this._defineService(services[name], options);
    }
}

Client.prototype._defineService = function (service, options) {
    var ports = service.ports,
        def = {};
    for (var name in ports) {

        if (options) {
            options.location = ports[name].location;
        }

        def[name] = this._definePort(ports[name], options ? options : ports[name].location);
    }
    return def;
}

Client.prototype._definePort = function (port, options) {
    var binding = port.binding,
        methods = binding.methods,
        def = {};
    for (var name in methods) {
        def[name] = this._defineMethod(methods[name], options);
        if (!this[name]) this[name] = def[name];
    }
    return def;
}

Client.prototype._defineMethod = function (method, options) {
    var self = this;
    return function (args, callback) {
        if (typeof args === 'function') {
            callback = args;
            args = {};
        }
        self._invoke(method, args, options, function (error, result, raw) {
            callback(error, result, raw);
        })
    }
}

Client.prototype._invoke = function (method, arguments, options, callback) {
    var self = this,
        name = method.$name,
        input = method.input,
        output = method.output,
        style = method.style,
        defs = this.wsdl.definitions,
        ns = defs.$targetNamespace,
        encoding = '',
        message = '',
        xml = null,
        headers = {
            SOAPAction: this.SOAPAction ? this.SOAPAction(ns, name) : (((ns.lastIndexOf("/") != ns.length - 1) ? ns + "/" : ns) + name),
            'Content-Type': "text/xml; charset=utf-8"
        },
        alias = findKey(defs.xmlns, ns);

    // Allow the security object to add headers
    if (self.security && self.security.addHeaders)
        self.security.addHeaders(headers);
    if (self.security && self.security.addOptions)
        self.security.addOptions(options);

    if (input.parts) {
        assert(!style || style == 'rpc', 'invalid message definition for document style binding');
        message = self.wsdl.objectToRpcXML(name, arguments, alias, ns);
        (method.inputSoap === 'encoded') && (encoding = 'soap:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" ');
    } else if (typeof (arguments) === 'string') {
        message = arguments;
    } else {
        assert(!style || style == 'document', 'invalid message definition for rpc style binding');
        message = self.wsdl.objectToDocumentXML(input.$name, arguments, input.targetNSAlias, input.targetNamespace);
    }
    xml = "<soap:Envelope " +
        "xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        encoding +
        this.wsdl.xmlnsInEnvelope + '>' +
        "<soap:Header>" +
        (self.security ? self.wsdl.objectToXML(self.security, null, alias, ns) : "") +
        "</soap:Header>" +
        "<soap:Body>" +
        message +
        "</soap:Body>" +
        "</soap:Envelope>";



    var l = options.location.replace(options.regexp, options.proxy)
    // var l = location.replace('http://192.168.80.239:5912/ws_services', '/api/private')
    debugger
    http.request(l, xml, function (err, response, body) {
        if (err) {
            callback(err, body ? self.wsdl.xmlToObject(body) : null, body);
        } else {
            try {
                var obj = self.wsdl.xmlToObject(body);
            } catch (error) {
                return callback(error, response, body);
            }
            var result = obj.Body[output.$name];
            // RPC/literal response body may contain element named after the method + 'Response'
            // This doesn't necessarily equal the ouput message name. See WSDL 1.1 Section 2.4.5
            if (!result) {
                result = obj.Body[name + 'Response'];
            }
            callback(null, result, body);
        }
    }, headers, options);
}

exports.Client = Client;