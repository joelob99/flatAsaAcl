/*!
* ============================================================================
*
* Flat Cisco ASA ACL
*
* flatAsaAcl.js
*
* Copyright (c) 2019,2020,2021 joelob99
*
* Released under the MIT License, see LICENSE.txt.
*
* History
*   2019-12-24: First Release.
*   2020-01-04: Update to v0.9.1.
*               - Fix the wrong icmp-type number for icmp6.
*               - Fix some udp port does not convert to the number.
*               - Add ACL line number and ACL element columns to the flattened
*                 ACL.
*   2021-06-07: Update to v0.9.2.
*               - Support names.
*
* @file This script flattens ACL in the Cisco ASA configuration. Also, it can
*       look up the specified addresses in the flattened ACL to confirm
*       whether the addresses are match.
* @copyright joelob99 2019,2020,2021
* @license MIT License
* @version v0.9.2
*
* ============================================================================
*/

'use strict';

/**
* Type of object.
*
* @const {number}
*/
const OBJECT_TYPE_UNKNOWN = 0;
const OBJECT_TYPE_NETWORK = 1;
const OBJECT_TYPE_SERVICE = 2;

/**
* Type of object-group.
*
* @const {number}
*/
const OBJECT_GROUP_TYPE_UNKNOWN  = 0;
const OBJECT_GROUP_TYPE_ICMPTYPE = 1;
const OBJECT_GROUP_TYPE_NETWORK  = 2;
const OBJECT_GROUP_TYPE_PROTOCOL = 3;
const OBJECT_GROUP_TYPE_SECURITY = 4;
const OBJECT_GROUP_TYPE_SERVICE  = 5;
const OBJECT_GROUP_TYPE_USER     = 6;
const OBJECT_GROUP_TYPE_PORT     = 7;

/**
* Type of port.
*
* @const {number}
*/
const PORT_TYPE_UNKNOWN = 0;
const PORT_TYPE_TCP     = 1;
const PORT_TYPE_UDP     = 2;
const PORT_TYPE_TCP_UDP = 3;

/**
* Bit flag of protocol type.
*
* @const {number}
*/
const PROTOCOL_TYPE_BIT_NONE        = 0x0000;
const PROTOCOL_TYPE_BIT_IP          = 0x0001;
const PROTOCOL_TYPE_BIT_ICMP        = 0x0002;
const PROTOCOL_TYPE_BIT_ICMP6       = 0x0004;
const PROTOCOL_TYPE_BIT_TCP         = 0x0008;
const PROTOCOL_TYPE_BIT_UDP         = 0x0010;
const PROTOCOL_TYPE_BIT_UNSUPPORTED = 0x1000;
const PROTOCOL_TYPE_BIT_SERVICE     = 0x2000;

/**
* Address type for lookup.
*
* @const {number}
*/
const LOOKUP_ADDRESS_TYPE_UNKNOWN = 0;
const LOOKUP_ADDRESS_TYPE_IPV4    = 1;
const LOOKUP_ADDRESS_TYPE_IPV6    = 2;
const LOOKUP_ADDRESS_TYPE_FQDN    = 3;

/**
* The column number of ACL.
*
* @const {number}
*/
const ACLCOL_ACL_NAME = 1;
const ACLCOL_ACL_TYPE = 2;

/**
* The column number of Normalized ACL.
*
* @const {number}
*/
const NMCOL_ACL_NAME    = 0;
const NMCOL_ACL_LINE    = 1;
const NMCOL_ACL_TYPE    = 2;
const NMCOL_PERMIT      = 3;
const NMCOL_PROTOCOL    = 4;
const NMCOL_SRC_ADDR    = 5;
const NMCOL_SRC_PORT    = 6;
const NMCOL_DST_ADDR    = 7;
const NMCOL_DST_PORT    = 8;
const NMCOL_ICMPTYCD    = 9;
const NMCOL_ACTIVE      = 10;

/**
* List of Cisco ASA's object type.
*
* @const {Object}
*/
const t_AsaObjectType = {
    'network'   : OBJECT_TYPE_NETWORK,
    'service'   : OBJECT_TYPE_SERVICE,
};

/**
* List of Cisco ASA's object-group type.
*
* @const {Object}
*/
const t_AsaObjectGroupType = {
    'icmp-type' : OBJECT_GROUP_TYPE_ICMPTYPE,
    'network'   : OBJECT_GROUP_TYPE_NETWORK,
    'service'   : OBJECT_GROUP_TYPE_SERVICE,
    'protocol'  : OBJECT_GROUP_TYPE_PROTOCOL,
    'security'  : OBJECT_GROUP_TYPE_SECURITY,
    'user'      : OBJECT_GROUP_TYPE_USER,
};

/*
* List of protocol supported in Cisco ASA.
*
* Though the protocol number of 'ip' is 0 in the following URL, protocol
* number 0 is not treated as 'ip' on the device.
*
* https://www.cisco.com/c/en/us/td/docs/security/asa/asa82/configuration/guide/config/ref_ports.html#wp1011316%0A
*
* @const {Object}
*/
const t_AsaProtocol = {
    'ah'     : 51,
    'eigrp'  : 88,
    'esp'    : 50,
    'gre'    : 47,
    'icmp'   : 1,
    'icmp6'  : 58,
    'igmp'   : 2,
    'igrp'   : 9,
    'ip'     : -1,
    'ipinip' : 4,
    'ipsec'  : 50,
    'nos'    : 94,
    'ospf'   : 89,
    'pcp'    : 108,
    'pim'    : 103,
    'pptp'   : 47,
    'sctp'   : 132,
    'snp'    : 109,
    'tcp'    : 6,
    'udp'    : 17,
};

const t_AsaProtocolNumber = {
    '51'  : 'ah',
    '88'  : 'eigrp',
    '50'  : 'esp',
    '47'  : 'gre',
    '1'   : 'icmp',
    '58'  : 'icmp6',
    '2'   : 'igmp',
    '9'   : 'igrp',
    // '-1'  : 'ip',
    '4'   : 'ipinip',
    // '50'  : 'ipsec',
    '94'  : 'nos',
    '89'  : 'ospf',
    '108' : 'pcp',
    '103' : 'pim',
    // '47'  : 'pptp',
    '132' : 'sctp',
    '109' : 'snp',
    '6'   : 'tcp',
    '17'  : 'udp',
};

/**
* List of icmp-type supported in Cisco ASA.
*
* @const {Object}
*/
const t_AsaIcmpType = {
    'alternate-address'    : 6,
    'conversion-error'     : 31,
    'echo'                 : 8,
    'echo-reply'           : 0,
    'information-reply'    : 16,
    'information-request'  : 15,
    'mask-reply'           : 18,
    'mask-request'         : 17,
    'mobile-redirect'      : 32,
    'parameter-problem'    : 12,
    'redirect'             : 5,
    'router-advertisement' : 9,
    'router-solicitation'  : 10,
    'source-quench'        : 4,
    'time-exceeded'        : 11,
    'timestamp-reply'      : 14,
    'timestamp-request'    : 13,
    'traceroute'           : 30,
    'unreachable'          : 3,
};

const t_AsaIcmpTypeNumber = {
    '6'  : 'alternate-address',
    '31' : 'conversion-error',
    '8'  : 'echo',
    '0'  : 'echo-reply',
    '16' : 'information-reply',
    '15' : 'information-request',
    '18' : 'mask-reply',
    '17' : 'mask-request',
    '32' : 'mobile-redirect',
    '12' : 'parameter-problem',
    '5'  : 'redirect',
    '9'  : 'router-advertisement',
    '10' : 'router-solicitation',
    '4'  : 'source-quench',
    '11' : 'time-exceeded',
    '14' : 'timestamp-reply',
    '13' : 'timestamp-request',
    '30' : 'traceroute',
    '3'  : 'unreachable',
};

const t_AsaIcmp6Type = {
    'echo'                   : 128,
    'echo-reply'             : 129,
    'membership-query'       : 130,
    'membership-reduction'   : 132,
    'membership-report'      : 131,
    'neighbor-advertisement' : 136,
    'neighbor-redirect'      : 137,
    'neighbor-solicitation'  : 135,
    'packet-too-big'         : 2,
    'parameter-problem'      : 4,
    'router-advertisement'   : 134,
    'router-renumbering'     : 138,
    'router-solicitation'    : 133,
    'time-exceeded'          : 3,
    'unreachable'            : 1,
};

const t_AsaIcmp6TypeNumber = {
    '128' : 'echo',
    '129' : 'echo-reply',
    '130' : 'membership-query',
    '132' : 'membership-reduction',
    '131' : 'membership-report',
    '136' : 'neighbor-advertisement',
    '137' : 'neighbor-redirect',
    '135' : 'neighbor-solicitation',
    '2'   : 'packet-too-big',
    '4'   : 'parameter-problem',
    '134' : 'router-advertisement',
    '138' : 'router-renumbering',
    '133' : 'router-solicitation',
    '3'   : 'time-exceeded',
    '1'   : 'unreachable',
};

/**
* List of port supported in Cisco ASA.
*
* @const {Object}
*/
const t_AsaTcpPort = {
    'aol'              : 5190,
    'bgp'              : 179,
    'chargen'          : 19,
    'cifs'             : 3020,
    'citrix-ica'       : 1494,
    'cmd'              : 514,
    'ctiqbe'           : 2748,
    'daytime'          : 13,
    'discard'          : 9,
    'domain'           : 53,
    'echo'             : 7,
    'exec'             : 512,
    'finger'           : 79,
    'ftp'              : 21,
    'ftp-data'         : 20,
    'gopher'           : 70,
    'h323'             : 1720,
    'hostname'         : 101,
    'http'             : 80,
    'https'            : 443,
    'ident'            : 113,
    'imap4'            : 143,
    'irc'              : 194,
    'kerberos'         : 750,
    'klogin'           : 543,
    'kshell'           : 544,
    'ldap'             : 389,
    'ldaps'            : 636,
    'login'            : 513,
    'lotusnotes'       : 1352,
    'lpd'              : 515,
    'netbios-ssn'      : 139,
    'nfs'              : 2049,
    'nntp'             : 119,
    'pcanywhere-data'  : 5631,
    'pim-auto-rp'      : 496,
    'pop2'             : 109,
    'pop3'             : 110,
    'pptp'             : 1723,
    'rsh'              : 514,
    'rtsp'             : 554,
    'sip'              : 5060,
    'smtp'             : 25,
    'sqlnet'           : 1521,
    'ssh'              : 22,
    'sunrpc'           : 111,
    'tacacs'           : 49,
    'talk'             : 517,
    'telnet'           : 23,
    'uucp'             : 540,
    'whois'            : 43,
    'www'              : 80,
};

const t_AsaTcpPortNumber = {
    '5190' : 'aol',
    '179'  : 'bgp',
    '19'   : 'chargen',
    '3020' : 'cifs',
    '1494' : 'citrix-ica',
    // '514'  : 'cmd',
    '2748' : 'ctiqbe',
    '13'   : 'daytime',
    '9'    : 'discard',
    '53'   : 'domain',
    '7'    : 'echo',
    '512'  : 'exec',
    '79'   : 'finger',
    '21'   : 'ftp',
    '20'   : 'ftp-data',
    '70'   : 'gopher',
    '1720' : 'h323',
    '101'  : 'hostname',
    // '80'   : 'http',
    '443'  : 'https',
    '113'  : 'ident',
    '143'  : 'imap4',
    '194'  : 'irc',
    '750'  : 'kerberos',
    '543'  : 'klogin',
    '544'  : 'kshell',
    '389'  : 'ldap',
    '636'  : 'ldaps',
    '513'  : 'login',
    '1352' : 'lotusnotes',
    '515'  : 'lpd',
    '139'  : 'netbios-ssn',
    '2049' : 'nfs',
    '119'  : 'nntp',
    '5631' : 'pcanywhere-data',
    '496'  : 'pim-auto-rp',
    '109'  : 'pop2',
    '110'  : 'pop3',
    '1723' : 'pptp',
    '514'  : 'rsh',
    '554'  : 'rtsp',
    '5060' : 'sip',
    '25'   : 'smtp',
    '1521' : 'sqlnet',
    '22'   : 'ssh',
    '111'  : 'sunrpc',
    '49'   : 'tacacs',
    '517'  : 'talk',
    '23'   : 'telnet',
    '540'  : 'uucp',
    '43'   : 'whois',
    '80'   : 'www',
};

const t_AsaUdpPort = {
    'biff'              : 512,
    'bootpc'            : 68,
    'bootps'            : 67,
    'cifs'              : 3020,
    'discard'           : 9,
    'dnsix'             : 195,
    'domain'            : 53,
    'echo'              : 7,
    'http'              : 80,
    'isakmp'            : 500,
    'kerberos'          : 750,
    'mobile-ip'         : 434,
    'nameserver'        : 42,
    'netbios-dgm'       : 138,
    'netbios-ns'        : 137,
    'nfs'               : 2049,
    'ntp'               : 123,
    'pcanywhere-status' : 5632,
    'pim-auto-rp'       : 496,
    'radius'            : 1645,
    'radius-acct'       : 1646,
    'rip'               : 520,
    'secureid-udp'      : 5510,
    'sip'               : 5060,
    'snmp'              : 161,
    'snmptrap'          : 162,
    'sunrpc'            : 111,
    'syslog'            : 514,
    'tacacs'            : 49,
    'talk'              : 517,
    'tftp'              : 69,
    'time'              : 37,
    'vxlan'             : 4789,
    'who'               : 513,
    'www'               : 80,
    'xdmcp'             : 177,
};

const t_AsaUdpPortNumber = {
    '512'  : 'biff',
    '68'   : 'bootpc',
    '67'   : 'bootps',
    '3020' : 'cifs',
    '9'    : 'discard',
    '195'  : 'dnsix',
    '53'   : 'domain',
    '7'    : 'echo',
    // '80'   : 'http',
    '500'  : 'isakmp',
    '750'  : 'kerberos',
    '434'  : 'mobile-ip',
    '42'   : 'nameserver',
    '138'  : 'netbios-dgm',
    '137'  : 'netbios-ns',
    '2049' : 'nfs',
    '123'  : 'ntp',
    '5632' : 'pcanywhere-status',
    '496'  : 'pim-auto-rp',
    '1645' : 'radius',
    '1646' : 'radius-acct',
    '520'  : 'rip',
    '5510' : 'secureid-udp',
    '5060' : 'sip',
    '161'  : 'snmp',
    '162'  : 'snmptrap',
    '111'  : 'sunrpc',
    '514'  : 'syslog',
    '49'   : 'tacacs',
    '517'  : 'talk',
    '69'   : 'tftp',
    '37'   : 'time',
    '4789' : 'vxlan',
    '513'  : 'who',
    '80'   : 'www',
    '177'  : 'xdmcp',
};

/**
* List of protocols supported in this script.
*
* @const {Object}
*/
const t_SupportedProtocolTypeBit = {
    'ip'    : PROTOCOL_TYPE_BIT_IP,
    'icmp'  : PROTOCOL_TYPE_BIT_ICMP,
    'icmp6' : PROTOCOL_TYPE_BIT_ICMP6,
    '1'     : PROTOCOL_TYPE_BIT_ICMP,
    '58'    : PROTOCOL_TYPE_BIT_ICMP6,
    'tcp'   : PROTOCOL_TYPE_BIT_TCP,
    'udp'   : PROTOCOL_TYPE_BIT_UDP,
    '6'     : PROTOCOL_TYPE_BIT_TCP,
    '17'    : PROTOCOL_TYPE_BIT_UDP,
};

/*
* Objects to save Cisco ASA's name list, object list, and object-group list.
*
* @const {Object}
*/
let g_Name = {};
let g_Object_Network = {};
let g_Object_Service = {};
let g_ObjectGroup_Network = {};
let g_ObjectGroup_Service = {};
let g_ObjectGroup_Port = {};
let g_ObjectGroup_Protocol = {};
let g_ObjectGroup_IcmpType = {};

/*
* Object to save the list of the protocol bits supported in this script.
*
* @const {Object}
*/
let g_ProtocolTypeBit = {};

/*
* ============================================================================
* Debug code
* ============================================================================
*/

const DEBUG_FLAG = 0;

/**
* @param {string} any
*/
function debugLog(any) {
    if (DEBUG_FLAG > 0) {
        console.log(any);
    }
}

/**
* @param {boolean} assertion
* @param {string} any
*/
function debugAssert(assertion, any) {
    if (DEBUG_FLAG > 0) {
        if (!assertion) {
            console.warn(any);
        }
    }
}

/*
* ============================================================================
* General functions for ACE
* ============================================================================
*/

/**
* This function returns the protocol number of the specified protocol name.
* Returns undefined if the protocol name is not recognized.
*
* @param {string} strProtocolName
* @return {(number|undefined)} Protocol number
*
*/
function getProtocolNumberFromProtocolName(strProtocolName) {
    return t_AsaProtocol[strProtocolName];
}

/**
* This function returns the protocol name of the specified protocol number
* string.
* Returns undefined if the protocol number string is not recognized.
*
* @param {string} strProtocolNumber
* @return {(string|undefined)} Protocol name
*
*/
function getProtocolNameFromProtocolNumberString(strProtocolNumber) {
    return t_AsaProtocolNumber[strProtocolNumber];
}

/**
* This function returns the icmp-type number of the specified icmp-type name.
* Returns undefined if the icmp-type name is not recognized.
*
* @param {string} strIcmpTypeName
* @return {(number|undefined)} icmp-type number.
*
*/
function getIcmpTypeNumberFromIcmpTypeName(strIcmpTypeName) {
    return t_AsaIcmpType[strIcmpTypeName];
}

/**
* This function returns the icmp-type name of the specified icmp-type number
* string.
* Returns undefined if the icmp-type number string is not recognized.
*
* @param {string} strIcmpTypeNumber
* @return {(string|undefined)} icmp-type name.
*
*/
function getIcmpTypeNameFromIcmpTypeNumberString(strIcmpTypeNumber) {
    return t_AsaIcmpTypeNumber[strIcmpTypeNumber];
}

/**
* This function returns the icmp6-type number of the specified icmp6-type name.
* Returns undefined if the icmp6-type name is not recognized.
*
* @param {string} strIcmp6TypeName
* @return {(number|undefined)} icmp6-type number.
*
*/
function getIcmp6TypeNumberFromIcmp6TypeName(strIcmp6TypeName) {
    return t_AsaIcmp6Type[strIcmp6TypeName];
}

/**
* This function returns the icmp6-type name of the specified icmp6-type number
* string.
* Returns undefined if the icmp6-type number string is not recognized.
*
* @param {string} strIcmp6TypeNumber
* @return {(string|undefined)} icmp6-type name.
*
*/
function getIcmp6TypeNameFromIcmp6TypeNumberString(strIcmp6TypeNumber) {
    return t_AsaIcmp6TypeNumber[strIcmp6TypeNumber];
}

/**
* This function returns the tcp port number of the specified tcp port name.
* Returns undefined if the tcp port name is not recognized.
*
* @param {string} strTcpPortName
* @return {(number|undefined)} Tcp port number.
*
*/
function getTcpPortNumberFromTcpPortName(strTcpPortName) {
    return t_AsaTcpPort[strTcpPortName];
}

/**
* This function returns the tcp port name of the specified port tcp number
* string.
* Returns undefined if the tcp port number string is not recognized.
*
* @param {string} strTcpPortNumber
* @return {(string|undefined)} Tcp port name.
*
*/
function getTcpPortNameFromTcpPortNumberString(strTcpPortNumber) {
    return t_AsaTcpPortNumber[strTcpPortNumber];
}

/**
* This function returns the udp port number of the specified udp port name.
* Returns undefined if the udp port name is not recognized.
*
* @param {string} strUdpPortName
* @return {(number|undefined)} Udp port number.
*
*/
function getUdpPortNumberFromUdpPortName(strUdpPortName) {
    return t_AsaUdpPort[strUdpPortName];
}

/**
* This function returns the udp port name of the specified udp port number
* string.
* Returns undefined if the udp port number string is not recognized.
*
* @param {string} strUdpPortNumber
* @return {(string|undefined)} Udp port name.
*
*/
function getUdpPortNameFromUdpPortNumberString(strUdpPortNumber) {
    return t_AsaUdpPortNumber[strUdpPortNumber];
}

/**
* This function returns the tcp-udp port number of the specified tcp-udp port
* name.
* Returns undefined if the tcp-udp port name is not recognized.
*
* @param {string} strTcpUdpPortName
* @return {(number|undefined)} Tcp-udp port number.
*
*/
function getTcpUdpPortNumberFromTcpUdpPortName(strTcpUdpPortName) {
    let intPortNumber = t_AsaTcpPort[strTcpUdpPortName];
    if (intPortNumber != undefined) {
        intPortNumber = t_AsaUdpPort[strTcpUdpPortName];
    }
    return intPortNumber;
}

/**
* This function returns true if the parameter is operator string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is operator string.
*   Otherwise, it is false.
*
*/
function isOperator(str) {
    return (str === 'lt' || str === 'gt' || str === 'eq' || str === 'neq' || str === 'range');
}

/**
* This function returns true if the parameter is ip protocol string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is ip protocol string.
*   Otherwise, it is false.
*
*/
function isIpProtocol(str) {
    return (str === 'ip');
}

/**
* This function returns true if the parameter is icmp protocol string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is icmp protocol string.
*   Otherwise, it is false.
*
*/
function isIcmpProtocol(str) {
    return (str === 'icmp' || str === '1');
}

/**
* This function returns true if the parameter is icmp6 protocol string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is icmp6 protocol string.
*   Otherwise, it is false.
*
*/
function isIcmp6Protocol(str) {
    return (str === 'icmp6' || str === '58');
}

/**
* This function returns true if the parameter is tcp protocol string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is tcp protocol string.
*   Otherwise, it is false.
*
*/
function isTcpProtocol(str) {
    return (str === 'tcp' || str === '6');
}

/**
* This function returns true if the parameter is udp protocol string.
* Otherwise, it is false.
*
* @param {string} str
* @return {boolean}
*   true if the parameter is udp protocol string.
*   Otherwise, it is false.
*
*/
function isUdpProtocol(str) {
    return (str === 'udp' || str === '17');
}

/**
* This function returns the protocol type bit of the protocol string. It is 0
* if unknown protocol string.
*
* @param {string} strProtocol
* @return {number} Protocol type bit.
*
*/
function getProtocolTypeBit(strProtocol) {
    let intProtocolTypeBit = PROTOCOL_TYPE_BIT_NONE;
    if (isIpProtocol(strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_IP;
    } else if (isIcmpProtocol(strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_ICMP;
    } else if (isIcmp6Protocol(strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_ICMP6;
    } else if (isTcpProtocol(strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_TCP;
    } else if (isUdpProtocol(strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_UDP;
    } else if (Number.isInteger(+strProtocol)) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_UNSUPPORTED;
    } else if (getProtocolNumberFromProtocolName(strProtocol) != undefined) {
        intProtocolTypeBit |= PROTOCOL_TYPE_BIT_UNSUPPORTED;
    }
    return intProtocolTypeBit;
}

/*
* ============================================================================
* IP address functions
* ============================================================================
*/

/**
* This function converts IPv4 netmask string to IPv4 prefix length.
*
* @param {string} strIPv4NetMask
* @return {number} IPv4 prefix length.
*
* @example
*   strIPv4NetMask     Return
*   -------------------------
*   '255.255.255.0' -> 24
*/
function getPrefixLengthFromIPv4NetMask(strIPv4NetMask) {
    const arrayStrMaskOctet = strIPv4NetMask.split('.');
    const arrayBytMaskOctet = new Uint8Array([parseInt(arrayStrMaskOctet[0]), parseInt(arrayStrMaskOctet[1]), parseInt(arrayStrMaskOctet[2]), parseInt(arrayStrMaskOctet[3])]);

    let intPrefixLength = 0;
    for (let i=0; i<=3; ++i) {
        let bytMask = arrayBytMaskOctet[i];
        for (let j=7; j>=0; --j) {
            if (bytMask >= Math.pow(2, j)) {
                ++intPrefixLength;
                bytMask -= Math.pow(2, j);
            } else if (bytMask == 0) {
                break;
            }
        }
    }
    return intPrefixLength;
}

/**
* This function converts IPv4 address string with netmask string to CIDR
* format.
*
* @param {string} strIPv4Addr
* @param {string} strIPv4NetMask
* @return {string} CIDR format IPv4 address.
*
* @example
*   strIPv4Addr   strIPv4NetMask     Return
*   -------------------------------------------------
*   '192.168.0.1' '255.255.255.0' -> '192.168.0.1/24'
*/
function getIPv4AddrWithPrefixLength(strIPv4Addr, strIPv4NetMask) {
    return (strIPv4Addr + '/' + getPrefixLengthFromIPv4NetMask(strIPv4NetMask));
}

/**
* This function converts octet's prefix length to octet's netmask.
*
* @param {number} intOctetPrefixLength
* @return {number} Octet's netmask.
*
* @example
*   intOctetPrefixLength    Return
*   ------------------------------
*   0                    ->   0
*   1                    -> 128
*   2                    -> 192
*   3                    -> 224
*   4                    -> 240
*   5                    -> 248
*   6                    -> 252
*   7                    -> 254
*   8                    -> 255
*/
function getOctetNetMaskFromOctetPrefixLength(intOctetPrefixLength) {
    return (256 - Math.pow(2, 8 - intOctetPrefixLength));
}

/**
* This function converts IPv4 prefix length to IPv4 netmask string.
*
* @param {number} intIPv4PrefixLength
* @return {string} IPv4 netmask string.
*
* @example
*   intIPv4PrefixLength    Return
*   ----------------------------------------
*    0                  -> '0.0.0.0'
*    8                  -> '255.0.0.0'
*   16                  -> '255.255.0.0'
*   20                  -> '255.255.240.0'
*   24                  -> '255.255.255.0'
*   28                  -> '255.255.255.240'
*   30                  -> '255.255.255.252'
*   32                  -> '255.255.255.255'
*/
function getIPv4NetMaskFromPrefixLength(intIPv4PrefixLength) {
    const arrayBytMaskOctet = new Uint8Array(4);

    if (intIPv4PrefixLength < 8) {
        arrayBytMaskOctet[0] = getOctetNetMaskFromOctetPrefixLength(intIPv4PrefixLength);
        arrayBytMaskOctet[1] = 0;
        arrayBytMaskOctet[2] = 0;
        arrayBytMaskOctet[3] = 0;
    } else if (intIPv4PrefixLength < 16) {
        arrayBytMaskOctet[0] = 255;
        arrayBytMaskOctet[1] = getOctetNetMaskFromOctetPrefixLength(intIPv4PrefixLength - 8);
        arrayBytMaskOctet[2] = 0;
        arrayBytMaskOctet[3] = 0;
    } else if (intIPv4PrefixLength < 24) {
        arrayBytMaskOctet[0] = 255;
        arrayBytMaskOctet[1] = 255;
        arrayBytMaskOctet[2] = getOctetNetMaskFromOctetPrefixLength(intIPv4PrefixLength - 16);
        arrayBytMaskOctet[3] = 0;
    } else {
        arrayBytMaskOctet[0] = 255;
        arrayBytMaskOctet[1] = 255;
        arrayBytMaskOctet[2] = 255;
        arrayBytMaskOctet[3] = getOctetNetMaskFromOctetPrefixLength(intIPv4PrefixLength - 24);
    }
    return (arrayBytMaskOctet[0].toString() + '.' + arrayBytMaskOctet[1].toString() + '.' + arrayBytMaskOctet[2].toString() + '.' + arrayBytMaskOctet[3].toString());
}

/**
* This function converts IPv6 prefix length to IPv6 netmask string.
*
* @param {number} intIPv6PrefixLength
* @return {string} IPv6 netmask string.
*
* @example
*   intIPv6PrefixLength    Return
*   ----------------------------------------------------------------
*     0                 -> '0000:0000:0000:0000:0000:0000:0000:0000'
*    16                 -> 'ffff:0000:0000:0000:0000:0000:0000:0000'
*    32                 -> 'ffff:ffff:0000:0000:0000:0000:0000:0000'
*    64                 -> 'ffff:ffff:ffff:ffff:0000:0000:0000:0000'
*    96                 -> 'ffff:ffff:ffff:ffff:ffff:ffff:0000:0000'
*   128                 -> 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
*/
function getIPv6NetMaskFromPrefixLength(intIPv6PrefixLength) {
    const arrayBytMaskOctet = new Uint8Array(16);
    const intIndexToCalc = Math.trunc(intIPv6PrefixLength / 8);
    for (let i=0; i<=intIndexToCalc-1; ++i) {
        arrayBytMaskOctet[i] = 255;
    }
    if (intIndexToCalc < 16) {
        arrayBytMaskOctet[intIndexToCalc] = getOctetNetMaskFromOctetPrefixLength(intIPv6PrefixLength - Math.trunc(intIPv6PrefixLength / 8) * 8);
        for (let i=intIndexToCalc+1; i<16; ++i) {
            arrayBytMaskOctet[i] = 0;
        }
    }

    let strNetMask = '';
    strNetMask += ('0' + arrayBytMaskOctet[0].toString(16)).slice(-2);
    strNetMask += ('0' + arrayBytMaskOctet[1].toString(16)).slice(-2);
    for (let i=2; i<16;) {
        strNetMask += ':';
        strNetMask += ('0' + arrayBytMaskOctet[i++].toString(16)).slice(-2);
        strNetMask += ('0' + arrayBytMaskOctet[i++].toString(16)).slice(-2);
    }
    return strNetMask;
}

/**
* This function returns the start address (i.e., network address) of the
* segment of the specified IPv4 address.
*
* @param {string} strIPv4Addr
* @param {string} strIPv4NetMask
* @return {string} The start address of the segment.
*
* @example
*   strIPv4Addr   strIPv4NetMask     Return
*   ----------------------------------------------
*   '192.168.0.1' '255.255.255.0' -> '192.168.0.0'
*/
function getIPv4StartAddr(strIPv4Addr, strIPv4NetMask) {
    const arrayStrIPv4Octet = strIPv4Addr.split('.');
    const arrayBytIPv4Octet = new Uint8Array([parseInt(arrayStrIPv4Octet[0]), parseInt(arrayStrIPv4Octet[1]), parseInt(arrayStrIPv4Octet[2]), parseInt(arrayStrIPv4Octet[3])]);
    const arrayStrMaskOctet = strIPv4NetMask.split('.');
    const arrayBytMaskOctet = new Uint8Array([parseInt(arrayStrMaskOctet[0]), parseInt(arrayStrMaskOctet[1]), parseInt(arrayStrMaskOctet[2]), parseInt(arrayStrMaskOctet[3])]);
    return (
        (arrayBytIPv4Octet[0] & arrayBytMaskOctet[0]).toString() + '.' +
        (arrayBytIPv4Octet[1] & arrayBytMaskOctet[1]).toString() + '.' +
        (arrayBytIPv4Octet[2] & arrayBytMaskOctet[2]).toString() + '.' +
        (arrayBytIPv4Octet[3] & arrayBytMaskOctet[3]).toString());
}

/**
* This function returns the end address (i.e., broadcast address) of the
* segment of the specified IPv4 address.
*
* @param {string} strIPv4Addr
* @param {string} strIPv4NetMask
* @return {string} The end address of the segment.
*
* @example
*   strIPv4Addr   strIPv4NetMask     Return
*   ------------------------------------------------
*   '192.168.0.1' '255.255.255.0' -> '192.168.0.255'
*/
function getIPv4EndAddr(strIPv4Addr, strIPv4NetMask) {
    const arrayStrIPv4Octet = strIPv4Addr.split('.');
    const arrayBytIPv4Octet = new Uint8Array([parseInt(arrayStrIPv4Octet[0]), parseInt(arrayStrIPv4Octet[1]), parseInt(arrayStrIPv4Octet[2]), parseInt(arrayStrIPv4Octet[3])]);
    const arrayStrMaskOctet = strIPv4NetMask.split('.');
    const arrayBytMaskOctet = new Uint8Array([parseInt(arrayStrMaskOctet[0]), parseInt(arrayStrMaskOctet[1]), parseInt(arrayStrMaskOctet[2]), parseInt(arrayStrMaskOctet[3])]);
    return (
        (arrayBytIPv4Octet[0] | (arrayBytMaskOctet[0] ^ 0xFF)).toString() + '.' +
        (arrayBytIPv4Octet[1] | (arrayBytMaskOctet[1] ^ 0xFF)).toString() + '.' +
        (arrayBytIPv4Octet[2] | (arrayBytMaskOctet[2] ^ 0xFF)).toString() + '.' +
        (arrayBytIPv4Octet[3] | (arrayBytMaskOctet[3] ^ 0xFF)).toString());
}

/**
* This function returns the start address (i.e., network address) of
* the segment of the specified IPv6 address.
* IPv4-compatible address and IPv4-mapped address are not supported.
*
* @param {string} strIPv6Addr
* @param {string} strIPv6NetMask
* @return {string} The start address of the segment.
*
* @example
*   strIPv6Addr                               strIPv6NetMask                               Return
*   --------------------------------------------------------------------------------------------------------------------------------
*   '2001:0db8:0001:0002:0003:0004:0005:0006' 'ffff:ffff:ffff:0000:0000:0000:0000:0000' -> '2001:0db8:0001:0000:0000:0000:0000:0000'
*/
function getIPv6StartAddr(strIPv6Addr, strIPv6NetMask) {
    const arrayStrIPv6Hextet = strIPv6Addr.split(':');
    const arrayIntIPv6Hextet = new Uint16Array([
        parseInt(arrayStrIPv6Hextet[0], 16), parseInt(arrayStrIPv6Hextet[1], 16), parseInt(arrayStrIPv6Hextet[2], 16), parseInt(arrayStrIPv6Hextet[3], 16),
        parseInt(arrayStrIPv6Hextet[4], 16), parseInt(arrayStrIPv6Hextet[5], 16), parseInt(arrayStrIPv6Hextet[6], 16), parseInt(arrayStrIPv6Hextet[7], 16)]);
    const arrayStrMaskHextet = strIPv6NetMask.split(':');
    const arrayIntMaskHextet = new Uint16Array([
        parseInt(arrayStrMaskHextet[0], 16), parseInt(arrayStrMaskHextet[1], 16), parseInt(arrayStrMaskHextet[2], 16), parseInt(arrayStrMaskHextet[3], 16),
        parseInt(arrayStrMaskHextet[4], 16), parseInt(arrayStrMaskHextet[5], 16), parseInt(arrayStrMaskHextet[6], 16), parseInt(arrayStrMaskHextet[7], 16)]);

    let intHextet = arrayIntIPv6Hextet[0] & arrayIntMaskHextet[0];
    let strIPv6NetAddr = ('0' + (intHextet >> 8).toString(16)).slice(-2) + ('0' + (intHextet & 0xFF).toString(16)).slice(-2);
    for (let i=1; i<8; ++i) {
        intHextet = arrayIntIPv6Hextet[i] & arrayIntMaskHextet[i];
        strIPv6NetAddr += ':' + ('0' + (intHextet >> 8).toString(16)).slice(-2) + ('0' + (intHextet & 0xFF).toString(16)).slice(-2);
    }
    return strIPv6NetAddr;
}

/**
* This function returns the end address of the segment of the specified IPv6
* address.
* IPv4-compatible address and IPv4-mapped address are not supported.
*
* @param {string} strIPv6Addr
* @param {string} strIPv6NetMask
* @return {string} The end address of the segment.
*
* @example
*   strIPv6Addr                               strIPv6NetMask                               Return
*   --------------------------------------------------------------------------------------------------------------------------------
*   '2001:0db8:0001:0002:0003:0004:0005:0006' 'ffff:ffff:ffff:0000:0000:0000:0000:0000' -> '2001:0db8:0001:ffff:ffff:ffff:ffff:ffff'
*/
function getIPv6EndAddr(strIPv6Addr, strIPv6NetMask) {
    const arrayStrIPv6Hextet = strIPv6Addr.split(':');
    const arrayIntIPv6Hextet = new Uint16Array([
        parseInt(arrayStrIPv6Hextet[0], 16), parseInt(arrayStrIPv6Hextet[1], 16), parseInt(arrayStrIPv6Hextet[2], 16), parseInt(arrayStrIPv6Hextet[3], 16),
        parseInt(arrayStrIPv6Hextet[4], 16), parseInt(arrayStrIPv6Hextet[5], 16), parseInt(arrayStrIPv6Hextet[6], 16), parseInt(arrayStrIPv6Hextet[7], 16)]);
    const arrayStrMaskHextet = strIPv6NetMask.split(':');
    const arrayIntMaskHextet = new Uint16Array([
        parseInt(arrayStrMaskHextet[0], 16), parseInt(arrayStrMaskHextet[1], 16), parseInt(arrayStrMaskHextet[2], 16), parseInt(arrayStrMaskHextet[3], 16),
        parseInt(arrayStrMaskHextet[4], 16), parseInt(arrayStrMaskHextet[5], 16), parseInt(arrayStrMaskHextet[6], 16), parseInt(arrayStrMaskHextet[7], 16)]);

    let intHextet = arrayIntIPv6Hextet[0] | (arrayIntMaskHextet[0] ^ 0xFFFF);
    let strIPv6LastAddr = ('0' + (intHextet >> 8).toString(16)).slice(-2) + ('0' + (intHextet & 0xFF).toString(16)).slice(-2);
    for (let i=1; i<8; ++i) {
        intHextet = arrayIntIPv6Hextet[i] | (arrayIntMaskHextet[i] ^ 0xFFFF);
        strIPv6LastAddr += ':' + ('0' + (intHextet >> 8).toString(16)).slice(-2) + ('0' + (intHextet & 0xFF).toString(16)).slice(-2);
    }
    return strIPv6LastAddr;
}

/**
* This function converts IPv4 address string to the array of hextet string and
* returns its array.
*
* @param {string} strOctetsIncludePeriod
* @return {(Array|undefined)}
*   The array of hextet string of a IPv4 address string.
*
* @example
*   strOctetsIncludePeriod    Return
*   -----------------------------------------
*   '192.168.0.1'          -> ['c0a8','0001']
*   '192.256.0.1'          -> []
*   '192.168.a.1'          -> []
*   'UNKNOWN'              -> undefined
*/
function getHextetStrArrayFromOctetStr(strOctetsIncludePeriod) {
    const arrayStrFullHextet = [];
    const arrayStrOctet = strOctetsIncludePeriod.split('.');
    const arrayIntOctet = new Uint8Array(arrayStrOctet.length);
    for (let i=0; i<arrayStrOctet.length; ++i) {
        if (arrayStrOctet[i].length > 3) {
            return undefined;
        }
        const c1 = arrayStrOctet[i].charAt(0);
        const c2 = arrayStrOctet[i].charAt(1);
        const c3 = arrayStrOctet[i].charAt(2);
        const intOctet = parseInt(arrayStrOctet[i]);
        if ((c1 === '' || (c1 >= '0' && c1 <= '9')) &&
            (c2 === '' || (c2 >= '0' && c2 <= '9')) &&
            (c3 === '' || (c3 >= '0' && c3 <= '9')) &&
            (intOctet <= 255)) {
            arrayIntOctet[i] = intOctet;
        } else {
            return arrayStrFullHextet;
        }
    }
    for (let i=0; i<(arrayIntOctet.length-1); i+=2) {
        arrayStrFullHextet[i/2] = ('0' + arrayIntOctet[i].toString(16)).slice(-2) + ('0' + arrayIntOctet[i+1].toString(16)).slice(-2);
    }
    return arrayStrFullHextet;
}

/**
* This function converts a part of IPv6 address string to the array of hextet
* string and returns its array. The parameter can be less than eight hextets.
*
* @param {string} strHextetsIncludeColon
* @return {(Array|undefined)}
*   The array of hextet string of a part of IPv6 address.
*
* @example
*   strHextetsIncludeColon                       Return
*   ------------------------------------------------------------------------------------------------------
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09' -> ['2001','0db8','1234','5678','90ab','cdef','fedc','ba09']
*   '2001:db8::1'                             -> ['2001','0db8','0000','0000','0000','0000','0000','0001']
*   '2001:db8::gggg'                          -> []
*   '2001:db8::fffff:1'                       -> undefined
*   'UNKNOWN'                                 -> undefined
*/
function getHextetStrArray(strHextetsIncludeColon) {
    const arrayStrFull = [];
    const arrayStrHextet = strHextetsIncludeColon.split(':');
    const arrayIntHextet = new Uint16Array(arrayStrHextet.length);
    for (let i=0; i<arrayStrHextet.length; ++i) {
        if (arrayStrHextet[i].length > 4) {
            return undefined;
        }
        const c1 = arrayStrHextet[i].charAt(0);
        const c2 = arrayStrHextet[i].charAt(1);
        const c3 = arrayStrHextet[i].charAt(2);
        const c4 = arrayStrHextet[i].charAt(3);
        const intHextet = parseInt(arrayStrHextet[i], 16);
        if ((c1 === '' || (c1 >= '0' && c1 <= '9') || (c1 >= 'a' && c1 <= 'f') || (c1 >= 'A' && c1 <= 'F')) &&
            (c2 === '' || (c2 >= '0' && c2 <= '9') || (c2 >= 'a' && c2 <= 'f') || (c2 >= 'A' && c2 <= 'F')) &&
            (c3 === '' || (c3 >= '0' && c3 <= '9') || (c3 >= 'a' && c3 <= 'f') || (c3 >= 'A' && c3 <= 'F')) &&
            (c4 === '' || (c4 >= '0' && c4 <= '9') || (c4 >= 'a' && c4 <= 'f') || (c4 >= 'A' && c4 <= 'F')) &&
            (intHextet <= 65535)) {
            arrayIntHextet[i] = intHextet;
        } else {
            return arrayStrFull;
        }
    }
    for (let i=0; i<arrayStrHextet.length; ++i) {
        arrayStrFull[i] = ('0' + (arrayIntHextet[i] >> 8).toString(16)).slice(-2) + ('0' + (arrayIntHextet[i] & 0xFF).toString(16)).slice(-2);
    }
    return arrayStrFull;
}

/**
* This function converts IPv6 address string to the array of hextet string and
* returns its array.
*
* @param {string} strIPv6Addr
* @return {Array} The array of hextet string of an IPv6 address.
*
* @example
*   strIPv6Addr                                    Return
*   --------------------------------------------------------------------------------------------------------
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09'   -> ['2001','0db8','1234','5678','90ab','cdef','fedc','ba09']
*   '0000:0000:0000:0000:0000:0000:192.168.0.1' -> ['0000','0000','0000','0000','0000','0000','c0a8','0001']
*   '0000:0000:0000:0000:0000:ffff:192.168.0.1' -> ['0000','0000','0000','0000','0000','ffff','c0a8','0001']
*   '2001:db8::1'                               -> ['2001','0db8','0000','0000','0000','0000','0000','0001']
*   '::192.168.0.1'                             -> ['0000','0000','0000','0000','0000','0000','c0a8','0001']
*   '::ffff:192.168.0.1'                        -> ['0000','0000','0000','0000','0000','ffff','c0a8','0001']
*   'eeee:0000:0000:0000:0000:ffff:192.168.0.1' -> []
*   '::eeee:192.168.0.1'                        -> []
*   '2001:db8::fffff:1'                         -> []
*   'UNKNOWN'                                   -> []
*/
function getIPv6HextetStrArray(strIPv6Addr) {
    const arrayStrHextet = [];
    const intIndexOfDblColon = strIPv6Addr.indexOf('::');

    let arrayStrFrontHextet = [];
    let strRear = '';
    if (intIndexOfDblColon == -1) { // Not compressed format.
        arrayStrFrontHextet.length = 0;
        strRear = strIPv6Addr;
    } else { // Compressed format.
        arrayStrFrontHextet = getHextetStrArray(strIPv6Addr.substring(0, intIndexOfDblColon));
        if (arrayStrFrontHextet == undefined) {
            return arrayStrHextet;
        }
        strRear = strIPv6Addr.substring(intIndexOfDblColon+2);
    }

    let arrayStrRearHextet = [];
    const intIndexOfPeriod = strRear.indexOf('.');
    if (intIndexOfPeriod == -1) { // IPv6 standard address.
        arrayStrRearHextet = getHextetStrArray(strRear);
        if (arrayStrRearHextet == undefined) {
            return arrayStrHextet;
        }
    } else { // IPv4-compatible address or IPv4-mapped address.
        const intEndOfHextet = strRear.lastIndexOf(':');
        if (intEndOfHextet == -1) {
            arrayStrRearHextet = getHextetStrArrayFromOctetStr(strRear);
            if (arrayStrRearHextet == undefined) {
                return arrayStrHextet;
            }
        } else {
            const arrayStrEndOfHextet = getHextetStrArray(strRear.substring(0, intEndOfHextet));
            if (arrayStrEndOfHextet == undefined) {
                return arrayStrHextet;
            }
            const arrayStrHextetOfIPv4 = getHextetStrArrayFromOctetStr(strRear.substring(intEndOfHextet+1));
            if (arrayStrHextetOfIPv4 == undefined) {
                return arrayStrHextet;
            }
            arrayStrRearHextet = arrayStrEndOfHextet.concat(arrayStrHextetOfIPv4);
        }
    }

    if ((intIndexOfDblColon == -1 && arrayStrRearHextet.length == 8) || (intIndexOfDblColon != -1 && (arrayStrFrontHextet.length + arrayStrRearHextet.length) <= 7)) {
        let index = 0;
        for (let i=0; i<arrayStrFrontHextet.length; ++i) {
            arrayStrHextet[index++] = arrayStrFrontHextet[i];
        }
        for (let i=0; i<(8-arrayStrFrontHextet.length-arrayStrRearHextet.length); ++i) {
            arrayStrHextet[index++] = '0000';
        }
        for (let i=0; i<arrayStrRearHextet.length; ++i) {
            arrayStrHextet[index++] = arrayStrRearHextet[i];
        }
        if (intIndexOfPeriod != -1) {
            if (parseInt(arrayStrHextet[0], 16) !== 0 ||
                parseInt(arrayStrHextet[1], 16) !== 0 ||
                parseInt(arrayStrHextet[2], 16) !== 0 ||
                parseInt(arrayStrHextet[3], 16) !== 0 ||
                parseInt(arrayStrHextet[4], 16) !== 0 ||
                (parseInt(arrayStrHextet[5], 16) !== 0 && arrayStrHextet[5] !== 'ffff')) {
                arrayStrHextet.length = 0;
            }
        }
    }
    return arrayStrHextet;
}

/**
* This function adapts the IPv6 address without prefix length to the full
* represented and returns the adapted address. It is '' if the argument is not
* IPv6 address.
*
* @param {string} strIPv6Addr
* @return {string} The full represented IPv6 address without prefix length.
*
* @example
*   strIPv6Addr                                    Return
*   ----------------------------------------------------------------------------------------
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09'   -> '2001:0db8:1234:5678:90ab:cdef:fedc:ba09'
*   '0000:0000:0000:0000:0000:0000:192.168.0.1' -> '0000:0000:0000:0000:0000:0000:c0a8:0001'
*   '0000:0000:0000:0000:0000:ffff:192.168.0.1' -> '0000:0000:0000:0000:0000:ffff:c0a8:0001'
*   '2001:db8::1'                               -> '2001:0db8:0000:0000:0000:0000:0000:0001'
*   '::192.168.0.1'                             -> '0000:0000:0000:0000:0000:0000:c0a8:0001'
*   '::ffff:192.168.0.1'                        -> '0000:0000:0000:0000:0000:ffff:c0a8:0001'
*   'eeee:0000:0000:0000:0000:ffff:192.168.0.1' -> ''
*   '::eeee:192.168.0.1'                        -> ''
*   '2001:db8::fffff:1'                         -> ''
*   'UNKNOWN'                                   -> ''
*/
function getIPv6FullRepresentedAddr(strIPv6Addr) {
    let strNormalizedIPv6Addr = '';
    const array = getIPv6HextetStrArray(strIPv6Addr);
    if (array[0]) {
        strNormalizedIPv6Addr = array[0];
        for (let i=1; i<array.length; ++i) {
            strNormalizedIPv6Addr += ':' + array[i];
        }
    }
    return strNormalizedIPv6Addr;
}

/**
* This function adapts the IPv6 address with prefix length to the full
* represented and returns the adapted address. It is '' if the argument is not
* IPv6 address.
*
* @param {string} strIPv6AddrWithPrefixLength
* @return {string} The full represented IPv6 address with prefix length.
*
* @example
*   strIPv6Addr                                       Return
*   -----------------------------------------------------------------------------------------------
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09/128'  -> '2001:0db8:1234:5678:90ab:cdef:fedc:ba09/128'
*   '0000:0000:0000:0000:0000:0000:192.168.0.1/96' -> '0000:0000:0000:0000:0000:0000:c0a8:0001/96'
*   '0000:0000:0000:0000:0000:ffff:192.168.0.1/96' -> '0000:0000:0000:0000:0000:ffff:c0a8:0001/96'
*   '2001:db8::1/128'                              -> '2001:0db8:0000:0000:0000:0000:0000:0001/128'
*   '::192.168.0.1/96'                             -> '0000:0000:0000:0000:0000:0000:c0a8:0001/96'
*   '::ffff:192.168.0.1/96'                        -> '0000:0000:0000:0000:0000:ffff:c0a8:0001/96'
*   'eeee:0000:0000:0000:0000:ffff:192.168.0.1/96' -> ''
*   '::eeee:192.168.0.1/128'                       -> ''
*   '2001:db8::fffff:1/128'                        -> ''
*   'UNKNOWN'                                      -> ''
*/
function getIPv6FullRepresentedAddrWithPrefixLength(strIPv6AddrWithPrefixLength) {
    const arrayStrIPv6 = strIPv6AddrWithPrefixLength.split('/');
    const strNormalizedIPv6Addr = getIPv6FullRepresentedAddr(arrayStrIPv6[0]);
    if (strNormalizedIPv6Addr === '') {
        return '';
    }
    return (strNormalizedIPv6Addr + '/' + arrayStrIPv6[1]);
}

/**
* This function adapts the IPv6 address without prefix length to the compressed
* represented and returns the adapted address. It is '' if the argument is not
* IPv6 address.
*
* @param {string} strIPv6Addr
* @return {string}
*   The compressed represented IPv6 address without prefix length.
*
* @example
*   strIPv6Addr                                    Return
*   ---------------------------------------------------------------------------------------
*   '0000:0000:0000:0000:0000:0000:0000:0000'   -> '::'
*   '0000:0000:0000:0000:0000:0000:0000:0001'   -> '::1'
*   '2001:0db8:0000:0000:0000:0000:0000:0001'   -> '2001:db8::1'
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09'   -> '2001:db8:1234:5678:90ab:cdef:fedc:ba09'
*   '0000:0000:0000:0000:0000:0000:192.168.0.1' -> '::192.168.0.1'
*   '0000:0000:0000:0000:0000:ffff:192.168.0.1' -> '::ffff:192.168.0.1'
*   '2001:db8::1'                               -> '2001:0db8::1'
*   '::192.168.0.1'                             -> '::192.168.0.1'
*   '::ffff:192.168.0.1'                        -> '::ffff:192.168.0.1'
*   'eeee:0000:0000:0000:0000:ffff:192.168.0.1' -> ''
*   '::eeee:192.168.0.1'                        -> ''
*   '2001:db8::fffff:1'                         -> ''
*   'UNKNOWN'                                   -> ''
*/
function getIPv6CompressedAddr(strIPv6Addr) {
    let strCompressedIPv6Addr = '';
    const array = getIPv6HextetStrArray(strIPv6Addr);
    if (array[0]) {
        for (let i=0; i<array.length; ++i) {
            array[i] = array[i].replace(/^0{1,3}/, '');
        }

        const arrayIPv4 = strIPv6Addr.match(/:(\d+\.\d+\.\d+\.\d+)$/);
        if (arrayIPv4 && arrayIPv4[1]) {
            // Recover IPv4-compatible address and IPv4-mapped address.
            strCompressedIPv6Addr = array.slice(0, 6).join(':') + ':' + arrayIPv4[1];
        } else {
            strCompressedIPv6Addr = array.join(':');
        }

        // Compress.
        strCompressedIPv6Addr = strCompressedIPv6Addr.replace('0:0:0:0:0:0:0:0', '::');
        for (let i=0; i<=10; i+=2) {
            const strTemp = strCompressedIPv6Addr.replace('0:0:0:0:0:0:0'.substring(i), ':');
            if (strCompressedIPv6Addr !== strTemp) {
                strCompressedIPv6Addr = strTemp;
                break;
            }
        }
        strCompressedIPv6Addr = strCompressedIPv6Addr.replace(':::', '::');
    }
    return strCompressedIPv6Addr;
}

/**
* This function adapts the IPv6 address with prefix length to the compressed
* represented and returns the adapted address. It is '' if the argument is not
* IPv6 address.
*
* @param {string} strIPv6AddrWithPrefixLength
* @return {string} The compressed represented IPv6 address with prefix length.
*
* @example
*   strIPv6Addr                                        Return
*   -----------------------------------------------------------------------------------------------
*   '0000:0000:0000:0000:0000:0000:0000:0000/0'     -> '::/0'
*   '0000:0000:0000:0000:0000:0000:0000:0001/128'   -> '::1/128'
*   '2001:0db8:0000:0000:0000:0000:0000:0001/128'   -> '2001:db8::1/128'
*   '2001:0db8:1234:5678:90aB:cDeF:feDC:bA09/128'   -> '2001:db8:1234:5678:90ab:cdef:fedc:ba09/128'
*   '0000:0000:0000:0000:0000:0000:192.168.0.1/128' -> '::192.168.0.1/128'
*   '0000:0000:0000:0000:0000:ffff:192.168.0.1/128' -> '::ffff:192.168.0.1/128'
*   '2001:db8::1/128'                               -> '2001:0db8::1/128'
*   '::192.168.0.1/128'                             -> '::192.168.0.1/128'
*   '::ffff:192.168.0.1/128'                        -> '::ffff:192.168.0.1/128'
*   'eeee:0000:0000:0000:0000:ffff:192.168.0.1/128' -> ''
*   '::eeee:192.168.0.1/128'                        -> ''
*   '2001:db8::fffff:1/128'                         -> ''
*   'UNKNOWN'                                       -> ''
*/
function getIPv6CompressedAddrWithPrefixLength(strIPv6AddrWithPrefixLength) {
    const arrayStrIPv6 = strIPv6AddrWithPrefixLength.split('/');
    const strCompressedIPv6Addr = getIPv6CompressedAddr(arrayStrIPv6[0]);
    if (strCompressedIPv6Addr === '') {
        return '';
    }
    return (strCompressedIPv6Addr + '/' + arrayStrIPv6[1]);
}

/*
* ============================================================================
* IP address compare functions
* ============================================================================
*/

/**
* This function returns true if the IPv4 address is included within the
* network segment. Otherwise, it is false.
* If the test address is a host address, confirm whether its address is within
* the network segment. If the test address is a network segment, confirm
* whether all addresses of the network segment are within the network segment.
*
* @param {string} strTestIPv4WithPrefixLength
* @param {string} strIPv4SegmentNetworkAddrWithPrefixLength
* @return {boolean}
*   true if the IPv4 address is included within the network segment.
*   Otherwise, it is false.
*
* @example
*   strTestIPv4WithPrefixLength strIPv4SegmentNetworkAddrWithPrefixLength    Return
*   -------------------------------------------------------------------------------
*   '192.168.0.17/24'           '192.168.0.0/24'                          -> true
*   '192.168.0.17/24'           '192.168.1.0/24'                          -> false
*   '192.168.0.17/24'           '192.168.0.0/28'                          -> true
*   '192.168.0.0/24'            '192.168.0.0/28'                          -> false
*   '192.168.0.17/28'           '192.168.0.0/24'                          -> true
*   '192.168.0.0/28'            '192.168.0.0/24'                          -> true
*/
function isIPv4WithPrefixLengthIncludedInSegment(strTestIPv4WithPrefixLength, strIPv4SegmentNetworkAddrWithPrefixLength) {
    const arrayStrTestIPv4           = strTestIPv4WithPrefixLength.split('/');
    const arrayStrIPv4SegmentNetworkAddr = strIPv4SegmentNetworkAddrWithPrefixLength.split('/');

    const strTestIPv4Addr = arrayStrTestIPv4[0];
    let intTestIPv4PrefixLength = parseInt(arrayStrTestIPv4[1]);
    let strTestIPv4NetworkAddr = getIPv4StartAddr(strTestIPv4Addr, getIPv4NetMaskFromPrefixLength(intTestIPv4PrefixLength));
    const intIPv4SegmentPrefixLength = parseInt(arrayStrIPv4SegmentNetworkAddr[1]);
    const strIPv4SegmentNetMask = getIPv4NetMaskFromPrefixLength(intIPv4SegmentPrefixLength);
    const strIPv4SegmentNetworkAddr = getIPv4StartAddr(arrayStrIPv4SegmentNetworkAddr[0], strIPv4SegmentNetMask);

    // If the test address is a host address, change the prefix length to 32.
    if (strTestIPv4NetworkAddr !== strTestIPv4Addr) {
        intTestIPv4PrefixLength = 32;
        strTestIPv4NetworkAddr = strTestIPv4Addr;
    }

    //
    if (intTestIPv4PrefixLength == intIPv4SegmentPrefixLength) {
        if (strTestIPv4NetworkAddr === strIPv4SegmentNetworkAddr) {
            return true;
        }
    } else if (intTestIPv4PrefixLength > intIPv4SegmentPrefixLength) {
        strTestIPv4NetworkAddr = getIPv4StartAddr(strTestIPv4Addr, strIPv4SegmentNetMask);
        if (strTestIPv4NetworkAddr === strIPv4SegmentNetworkAddr) {
            return true;
        }
    }
    return false;
}

/**
* This function returns true if the IPv6 address is included within the
* network segment. Otherwise, it is false.
* If the test address is a host address, confirm whether its address is within
* the network segment. If the test address is a network segment, confirm
* whether all addresses of the network segment are within the network segment.
* Both argument addresses have to be the full represented.
*
* @param {string} strTestIPv6WithPrefixLength
* @param {string} strIPv6SegmentNetworkAddrWithPrefixLength
* @return {boolean}
*   true if the IPv6 address is included within the network segment.
*   Otherwise, it is false.
*
* @example
*   strTestIPv6WithPrefixLength                  strIPv6SegmentNetworkAddrWithPrefixLength       Return
*   ---------------------------------------------------------------------------------------------------
*   '2001:0db8:0001:0002:0003:0004:0005:0006/64' '2001:0db8:0001:0002:0000:0000:0000:0000/64' -> true
*   '2001:0db8:0001:0002:0003:0004:0005:0006/64' '2001:0db8:0001:0003:0000:0000:0000:0000/64' -> false
*   '2001:0db8:0001:0002:0003:0004:0005:0006/64' '2001:0db8:0001:0002:0000:0000:0000:0000/96' -> true
*   '2001:0db8:0001:0002:0000:0000:0000:0000/64' '2001:0db8:0001:0002:0000:0000:0000:0000/96' -> false
*   '2001:0db8:0001:0002:0003:0004:0005:0006/96' '2001:0db8:0001:0002:0000:0000:0000:0000/64' -> true
*   '2001:0db8:0001:0002:0000:0000:0000:0000/96' '2001:0db8:0001:0002:0000:0000:0000:0000/64' -> true
*/
function isIPv6WithPrefixLengthIncludedInSegment(strTestIPv6WithPrefixLength, strIPv6SegmentNetworkAddrWithPrefixLength) {
    const arrayStrTestIPv6           = strTestIPv6WithPrefixLength.split('/');
    const arrayStrIPv6SegmentNetworkAddr = strIPv6SegmentNetworkAddrWithPrefixLength.split('/');

    const strTestIPv6Addr = arrayStrTestIPv6[0];
    let intTestIPv6PrefixLength = parseInt(arrayStrTestIPv6[1]);
    let strTestIPv6NetworkAddr = getIPv6StartAddr(strTestIPv6Addr, getIPv6NetMaskFromPrefixLength(intTestIPv6PrefixLength));
    const intIPv6SegmentPrefixLength = parseInt(arrayStrIPv6SegmentNetworkAddr[1]);
    const strIPv6SegmentNetMask = getIPv6NetMaskFromPrefixLength(intIPv6SegmentPrefixLength);
    const strIPv6SegmentNetworkAddr = getIPv6StartAddr(arrayStrIPv6SegmentNetworkAddr[0], strIPv6SegmentNetMask);

    // If the test address is a host address, change the prefix length to 128.
    if (strTestIPv6NetworkAddr !== strTestIPv6Addr) {
        intTestIPv6PrefixLength = 128;
        strTestIPv6NetworkAddr = strTestIPv6Addr;
    }

    //
    if (intTestIPv6PrefixLength == intIPv6SegmentPrefixLength) {
        if (strTestIPv6NetworkAddr === strIPv6SegmentNetworkAddr) {
            return true;
        }
    } else if (intTestIPv6PrefixLength > intIPv6SegmentPrefixLength) {
        strTestIPv6NetworkAddr = getIPv6StartAddr(strTestIPv6Addr, strIPv6SegmentNetMask);
        if (strTestIPv6NetworkAddr === strIPv6SegmentNetworkAddr) {
            return true;
        }
    }
    return false;
}

/**
* This function compares two IPv4 addresses.
*
* @param {string} strIPv4_1
* @param {string} strIPv4_2
* @return {number}
*    1: IPv4_1 > IPv4_2
*    0: IPv4_1 = IPv4_2
*   -1: IPv4_1 < IPv4_2
*
*/
function compareIPv4(strIPv4_1, strIPv4_2) {
    const arrayStrIPv4Octet_1 = strIPv4_1.split('.');
    const arrayIntIPv4Octet_1 = [];
    for (let i=0; i<4; ++i) {
        arrayIntIPv4Octet_1[i] = parseInt(arrayStrIPv4Octet_1[i]);
    }
    const arrayStrIPv4Octet_2 = strIPv4_2.split('.');
    const arrayIntIPv4Octet_2 = [];
    for (let i=0; i<4; ++i) {
        arrayIntIPv4Octet_2[i] = parseInt(arrayStrIPv4Octet_2[i]);
    }

    for (let i=0; i<4; ++i) {
        if (arrayIntIPv4Octet_1[i] > arrayIntIPv4Octet_2[i]) {
            return 1;
        } else if (arrayIntIPv4Octet_1[i] < arrayIntIPv4Octet_2[i]) {
            return -1;
        }
    }
    return 0;
}

/**
* This function compares two IPv6 addresses.
*
* @param {string} strIPv6_1
* @param {string} strIPv6_2
* @return {number}
*    1: IPv6_1 > IPv6_2
*    0: IPv6_1 = IPv6_2
*   -1: IPv6_1 < IPv6_2
*
*/
function compareIPv6(strIPv6_1, strIPv6_2) {
    const arrayStrIPv6_16bits_1 = strIPv6_1.split(':');
    const arrayIntIPv6_16bits_1 = [];
    for (let i=0; i<8; ++i) {
        arrayIntIPv6_16bits_1[i] = parseInt(arrayStrIPv6_16bits_1[i], 16);
    }
    const arrayStrIPv6_16bits_2 = strIPv6_2.split(':');
    const arrayIntIPv6_16bits_2 = [];
    for (let i=0; i<8; ++i) {
        arrayIntIPv6_16bits_2[i] = parseInt(arrayStrIPv6_16bits_2[i], 16);
    }

    for (let i=0; i<8; ++i) {
        if (arrayIntIPv6_16bits_1[i] > arrayIntIPv6_16bits_2[i]) {
            return 1;
        } else if (arrayIntIPv6_16bits_1[i] < arrayIntIPv6_16bits_2[i]) {
            return -1;
        }
    }
    return 0;
}

/**
* This function returns true if the IPv4 address is within the range.
* Otherwise, it is false.
* If the test address is a host address, confirm whether its address is within
* the range. If the test address is a network segment, confirm whether all
* addresses of the network segment are within the range.
*
* @param {string} strTestIPv4WithPrefixLength
* @param {string} strIPv4Range
* @return {boolean}
*   true if the IPv4 address is within the range.
*   Otherwise, it is false.
*
* @example
*   strTestIPv4WithPrefixLength strIPv4Range                   Return
*   -----------------------------------------------------------------
*   '192.168.0.1/32'            '192.168.0.0-192.168.0.100' -> true
*   '192.168.0.1/32'            '192.168.0.8-192.168.0.100' -> false
*   '192.168.0.0/24'            '192.168.0.0-192.168.0.100' -> false
*   '192.168.0.0/24'            '192.168.0.0-192.168.1.0'   -> true
*   '192.168.0.1/24'            '192.168.0.0-192.168.0.100' -> true
*/
function isIPv4WithPrefixLengthIncludedInRange(strTestIPv4WithPrefixLength, strIPv4Range) {
    const arrayStrTestIPv4 = strTestIPv4WithPrefixLength.split('/');
    const arrayStrIPv4Range = strIPv4Range.split('-');

    const strTestIPv4Addr = arrayStrTestIPv4[0];
    const intTestIPv4PrefixLength = parseInt(arrayStrTestIPv4[1]);
    const strTestIPv4NetMask = getIPv4NetMaskFromPrefixLength(intTestIPv4PrefixLength);
    let strTestIPv4Start = getIPv4StartAddr(strTestIPv4Addr, strTestIPv4NetMask);
    let strTestIPv4End = getIPv4EndAddr(strTestIPv4Addr, strTestIPv4NetMask);

    // If the test address is a host address, change the start address and the end address to the same as the test address.
    if (strTestIPv4Addr !== strTestIPv4Start) {
        strTestIPv4Start = strTestIPv4End = strTestIPv4Addr;
    }

    //
    if (compareIPv4(strTestIPv4Start, arrayStrIPv4Range[0]) >= 0 && compareIPv4(strTestIPv4End, arrayStrIPv4Range[1]) <= 0) {
        return true;
    }
    return false;
}

/**
* This function returns true if the IPv6 address is within the range.
* Otherwise, it is false.
* If the test address is a host address, confirm whether its address is within
* the range. If the test address is a network segment, confirm whether all
* addresses of the network segment are within the range.
* Both argument addresses have to be the full represented.
*
* @param {string} strTestIPv6WithPrefixLength
* @param {string} strIPv6Range
* @return {boolean}
*   true if the IPv6 address is within the range.
*   Otherwise, it is false.
*
* @example
*   strTestIPv6WithPrefixLength                    strIPv6Range                                                                         Return
*   ------------------------------------------------------------------------------------------------------------------------------------------
*   '2001:0db8:0001:0002:0003:0004:0005:0006/128'  '2001:0db8:0001:0002:0003:0004:0005:0000-2001:0db8:0001:0002:0003:0004:0005:0010' -> true
*   '2001:0db8:0001:0002:0003:0004:0005:0006/128'  '2001:0db8:0001:0002:0003:0004:0005:0008-2001:0db8:0001:0002:0003:0004:0005:0010' -> false
*   '2001:0db8:0001:0002:0000:0000:0000:0000/64'   '2001:0db8:0001:0002:0003:0004:0005:0000-2001:0db8:0001:0002:0003:0004:0005:0010' -> false
*   '2001:0db8:0001:0002:0000:0000:0000:0000/64'   '2001:0db8:0001:0002:0000:0000:0000:0000-2001:0db8:0001:0003:0000:0000:0000:0000' -> true
*   '2001:0db8:0001:0002:0003:0004:0005:0006/64'   '2001:0db8:0001:0002:0003:0004:0005:0000-2001:0db8:0001:0002:0003:0004:0005:0010' -> true
*/
function isIPv6WithPrefixLengthIncludedInRange(strTestIPv6WithPrefixLength, strIPv6Range) {
    const arrayStrTestIPv6 = strTestIPv6WithPrefixLength.split('/');
    const arrayStrIPv6Range = strIPv6Range.split('-');

    const strTestIPv6Addr = arrayStrTestIPv6[0];
    const intTestIPv6PrefixLength = parseInt(arrayStrTestIPv6[1]);
    const strTestIPv6NetMask = getIPv6NetMaskFromPrefixLength(intTestIPv6PrefixLength);
    let strTestIPv6Start = getIPv6StartAddr(strTestIPv6Addr, strTestIPv6NetMask);
    let strTestIPv6End = getIPv6EndAddr(strTestIPv6Addr, strTestIPv6NetMask);

    // If the test address is a host address, change the start address and the end address to the same as the test address.
    if (strTestIPv6Addr !== strTestIPv6Start) {
        strTestIPv6Start = strTestIPv6End = strTestIPv6Addr;
    }

    //
    if (compareIPv6(strTestIPv6Start, arrayStrIPv6Range[0]) >= 0 && compareIPv6(strTestIPv6End, arrayStrIPv6Range[1]) <= 0) {
        return true;
    }
    return false;
}

/*
* ============================================================================
* Extract functions.
* ============================================================================
*/

/**
* This function retrieves protocol from ACE tokens and returns the protocol
* number string. The return string is 'ip' if the token is 'ip'. It is as-is
* if the token is not recognized, and it is '' if the token does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Object}
*   An associative array of the protocol number string, and next index of the
*   ACE token.
*
* @example
*   arrayToken   index    Return['value'] Return['next_index']
*   ----------------------------------------------------------
*   ['0']        0     -> '0'             1
*   ['ip']       0     -> 'ip'            1
*   ['ospf']     0     -> '89'            1
*   ['UNKNOWN']  0     -> 'UNKNOWN'       1
*   []           0     -> ''              0
*/
function extractProtocolFromAce(arrayToken, index) {
    const objReturn = {};
    let strProtocolNumber = '';
    if (arrayToken[index]) {
        if (Number.isInteger(+arrayToken[index])) {
            strProtocolNumber = arrayToken[index];
        } else {
            const intProtocolNumber = getProtocolNumberFromProtocolName(arrayToken[index]);
            strProtocolNumber = (intProtocolNumber == undefined) ? arrayToken[index] : (intProtocolNumber == -1) ? 'ip' : intProtocolNumber.toString();
        }
        // Because the protocol field is a required, increment the index even if it is an unknown protocol name.
        ++index;
    } else {
        // The protocol field is a required.
        console.warn(`protocol name or protocol number does not exist.`);
    }
    objReturn['value'] = strProtocolNumber;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves icmp-type from ACE tokens and returns the icmp-type
* number string. The return string is '' if the token is not recognized or the
* token does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @param {boolean} boolIcmp6
* @return {Object}
*   An associative array of the icmp-type number string, and next index of the
*   ACE token.
*
* @example
*   arrayToken   index boolIcmp6    Return['value'] Return['next_index']
*   --------------------------------------------------------------------
*   ['0']        0     false     -> '0'             1
*   ['echo']     0     false     -> '8'             1
*   ['echo']     0     true      -> '128'           1
*   ['log']      0     false     -> ''              0
*   ['UNKNOWN']  0     false     -> ''              0
*   []           0     false     -> ''              0
*/
function extractIcmpTypeFromAce(arrayToken, index, boolIcmp6) {
    const objReturn = {};
    let strIcmpTypeNumber = '';
    if (arrayToken[index]) {
        if (Number.isInteger(+arrayToken[index])) {
            strIcmpTypeNumber = arrayToken[index++];
        } else {
            const intIcmpTypeNumber = boolIcmp6 ? getIcmp6TypeNumberFromIcmp6TypeName(arrayToken[index]) : getIcmpTypeNumberFromIcmpTypeName(arrayToken[index]);
            if (intIcmpTypeNumber != undefined) {
                strIcmpTypeNumber = intIcmpTypeNumber.toString();
                ++index;
            }
        }
    } else {
        // No outputs an error message due to the icmp-type possibly not exist at the tail of ACE.
    }
    objReturn['value'] = strIcmpTypeNumber;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves icmp-type and icmp-code from ACE tokens and returns
* the normalized string, which combined icmp-type number string and icmp-code
* string with '/'. The return string is 'icmp-type/any' if icmp-code does not
* exist. It is 'any/any' if the token is not recognized or the token does not
* exist.
*
* @param {Array} arrayToken
* @param {number} index
* @param {boolean} boolIcmp6
* @return {Object}
*   An associative array of the normalized icmp-type and icmp-code string,
*   and next index of the ACE token.
*
* @example
*   arrayToken     index boolIcmp6    Return['value'] Return['next_index']
*   ----------------------------------------------------------------------
*   ['0','255']    0     false     -> '0/255'         2
*   ['echo','255'] 0     false     -> '8/255'         2
*   ['echo','255'] 0     true      -> '128/255'       2
*   ['0']          0     false     -> '0/any'         1
*   ['echo']       0     false     -> '8/any'         1
*   ['echo']       0     true      -> '128/any'       1
*   ['0','log']    0     false     -> '0/any'         1
*   ['echo','log'] 0     false     -> '8/any'         1
*   ['log']        0     false     -> 'any/any'       0
*   ['UNKNOWN']    0     false     -> 'any/any'       0
*   []             0     false     -> 'any/any'       0
*/
function extractIcmpTypeAndCodeFromAce(arrayToken, index, boolIcmp6) {
    const objReturn = {};
    let strIcmpTypeAndCode = 'any/any';

    // icmp-type.
    if (arrayToken[index]) {
        const objIcmpType = extractIcmpTypeFromAce(arrayToken, index, boolIcmp6);
        if (objIcmpType['next_index'] > index) {
            strIcmpTypeAndCode = objIcmpType['value'];
            index = objIcmpType['next_index'];

            // icmp-code.
            if (Number.isInteger(+arrayToken[index])) {
                strIcmpTypeAndCode += '/' + arrayToken[index++];
            } else { // icmp-code not exists.
                strIcmpTypeAndCode += '/any';
            }
        }
    }
    objReturn['value'] = strIcmpTypeAndCode;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves port name or number from ACE tokens and returns the
* normalized port number string. The return string is as-is if the token is not
* recognized, and it is '' if the token does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @param {number} intPortType
* @return {Object}
*   An associative array of the normalized port number string and the next
*   index of the ACE token.
*
* @example
*   arrayToken   index intPortType          Return['value'] Return['next_index']
*   ----------------------------------------------------------------------------
*   ['0']        0     PORT_TYPE_TCP_UDP -> '0'             1
*   ['www']      0     PORT_TYPE_TCP_UDP -> '80'            1
*   ['www']      0     PORT_TYPE_TCP     -> '80'            1
*   ['www']      0     PORT_TYPE_UDP     -> '80'            1
*   ['rsh']      0     PORT_TYPE_TCP_UDP -> 'rsh'           1
*   ['rsh']      0     PORT_TYPE_TCP     -> '514'           1
*   ['rsh']      0     PORT_TYPE_UDP     -> 'rsh'           1
*   ['syslog']   0     PORT_TYPE_TCP_UDP -> 'syslog         1
*   ['syslog']   0     PORT_TYPE_TCP     -> 'syslog'        1
*   ['syslog']   0     PORT_TYPE_UDP     -> '514'           1
*   ['UNKNOWN']  0     PORT_TYPE_TCP_UDP -> 'UNKNOWN'       1
*   []           0     PORT_TYPE_TCP_UDP -> ''              0
*/
function extractPortFromAce(arrayToken, index, intPortType) {
    const objReturn = {};
    let strPortNumber = '';
    if (arrayToken[index]) {
        if (Number.isInteger(+arrayToken[index])) {
            strPortNumber = arrayToken[index];
        } else {
            const intPortNumber = intPortType == PORT_TYPE_TCP_UDP ? getTcpUdpPortNumberFromTcpUdpPortName(arrayToken[index]) : intPortType == PORT_TYPE_TCP ? getTcpPortNumberFromTcpPortName(arrayToken[index]) : getUdpPortNumberFromUdpPortName(arrayToken[index]);
            strPortNumber = (intPortNumber == undefined) ? arrayToken[index] : intPortNumber.toString();
        }
        // Because the port field is a required, increment the index even if it is an unknown port name.
        ++index;
    } else {
        // The port field is a required.
        console.warn(`port name or port number does not exist.`);
    }
    objReturn['value'] = strPortNumber;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves port condition from ACE tokens and returns the normalized port
* condition string. The return string is '' if the port condition is not recognized or
* does not exist. If the required token is missing, it is described as 'undefined'
* instead.
*
* @param {Array} arrayToken
* @param {number} index
* @param {number} intPortType
* @return {Object}
*   An associative array of the normalized port condition string and the next
*   index of the ACE token.
*
* @example
*   arrayToken                  index intPortType          Return['value']             Return['next_index']
*   -------------------------------------------------------------------------------------------------------
*   ['lt','21']                 0     PORT_TYPE_TCP_UDP -> 'lt/21'                     2
*   ['eq','http']               0     PORT_TYPE_TCP_UDP -> 'eq/80'                     2
*   ['eq','www']                0     PORT_TYPE_TCP_UDP -> '80'                        2
*   ['eq','www']                0     PORT_TYPE_TCP     -> '80'                        2
*   ['eq','www']                0     PORT_TYPE_UDP     -> '80'                        2
*   ['eq','rsh']                0     PORT_TYPE_TCP_UDP -> 'eq/rsh'                    2
*   ['eq','rsh']                0     PORT_TYPE_TCP     -> 'eq/514'                    2
*   ['eq','rsh']                0     PORT_TYPE_UDP     -> 'eq/rsh'                    2
*   ['eq','syslog']             0     PORT_TYPE_TCP_UDP -> 'eq/syslog'                 2
*   ['eq','syslog']             0     PORT_TYPE_TCP     -> 'eq/syslog'                 2
*   ['eq','syslog']             0     PORT_TYPE_UDP     -> 'eq/514'                    2
*   ['range','10000','20000']   0     PORT_TYPE_TCP_UDP -> 'range/10000-20000'         3
*   ['range','20','ftp']        0     PORT_TYPE_TCP_UDP -> 'range/20-21'               3
*   ['range','https','444']     0     PORT_TYPE_TCP_UDP -> 'range/443-444'             3
*   ['gt']                      0     PORT_TYPE_TCP_UDP -> 'gt/undefined'              1
*   ['neq','UNKNOWN']           0     PORT_TYPE_TCP_UDP -> 'neq/UNKNOWN'               2
*   ['range']                   0     PORT_TYPE_TCP_UDP -> 'range/undefined-undefined' 1
*   ['range','10000']           0     PORT_TYPE_TCP_UDP -> 'range/10000-undefined'     2
*   ['range','10000','UNKNOWN'] 0     PORT_TYPE_TCP_UDP -> 'range/10000-UNKNOWN'       3
*   ['range','UNKNOWN']         0     PORT_TYPE_TCP_UDP -> 'range/UNKNOWN-undefined'   2
*   ['log']                     0     PORT_TYPE_TCP_UDP -> ''                          0
*   ['UNKNOWN']                 0     PORT_TYPE_TCP_UDP -> ''                          0
*   []                          0     PORT_TYPE_TCP_UDP -> ''                          0
*/
function extractPortConditionFromAce(arrayToken, index, intPortType) {
    const objReturn = {};
    let strPortCondition = '';
    if (arrayToken[index]) {
        const strOperator = arrayToken[index];
        if (strOperator === 'lt' || strOperator === 'gt' || strOperator === 'eq' || strOperator === 'neq') {
            const objPort = extractPortFromAce(arrayToken, ++index, intPortType);
            if (objPort['next_index'] == index) { // Not exists the port name and port number.
                strPortCondition = strOperator + '/undefined';
            } else {
                strPortCondition = strOperator + '/' + objPort['value'];
                index = objPort['next_index'];
            }
        } else if (strOperator === 'range') {
            const objPortStart = extractPortFromAce(arrayToken, ++index, intPortType);
            if (objPortStart['next_index'] == index) { // Not exists the port start.
                strPortCondition = strOperator + '/undefined-undefined';
            } else {
                index = objPortStart['next_index'];
                const objPortEnd = extractPortFromAce(arrayToken, index, intPortType);
                if (objPortEnd['next_index'] == index) { // Not exists the port end.
                    strPortCondition = strOperator + '/' + objPortStart['value'] + '-undefined';
                } else {
                    strPortCondition = strOperator + '/' + objPortStart['value'] + '-' + objPortEnd['value'];
                    index = objPortEnd['next_index'];
                }
            }
        } else { // Unknown operator.
            // The port condition possibly not exist at the tail of ACE.
        }
    } else {
        // No outputs an error message due to the port condition possibly not exist at the tail of ACE.
    }
    objReturn['value'] = strPortCondition;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves the network address from ACE tokens and returns the
* normalized network address string. IPv4 address is changed to the CIDR
* format, and IPv6 address is adapted to the full represented. It is changed
* to '0/0' if the network address is 'any'. The return string is '' if the
* network address does not exist. The address type FQDN, 'object',
* 'object-group', and 'interface' are never passed to this function.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Object}
*   An associative array of the normalized string of network address and the
*   next index of the ACE token.
*
* @example
*   Variables state when calls.
*   ---------------------------------------------------------------------------------------
*   g_Name['ADDR1'] = { address:'y.y.y.y', description:'' }
*   g_Name['ADDR2'] = { address:'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy', description:'' }
*
*   arrayToken            index    Return['value']                               Return['next_index']
*   -------------------------------------------------------------------------------------------------
*   ['host','x.x.x.x']    0     -> 'x.x.x.x/32'                                  2
*   ['host','x:x:x::x']   0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/128' 2
*   ['host','ADDR1']      0     -> 'y.y.y.y/32'                                  2
*   ['host','ADDR2']      0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/128' 2
*   ['any']               0     -> '0/0'                                         1
*   ['any4']              0     -> '0.0.0.0/0'                                   1
*   ['any6']              0     -> '0000:0000:0000:0000:0000:0000:0000:0000/0'   1
*   ['x.x.x.x','m.m.m.m'] 0     -> 'x.x.x.x/nn'                                  2
*   ['ADDR1','m.m.m.m']   0     -> 'y.y.y.y/nn'                                  2
*   ['x:x:x::x/nn']       0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/nn'  1
*   ['ADDR2/nn']          0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/nn'  1
*   []                    0     -> ''                                            0
*/
function extractIPAddrFromAce(arrayToken, index) {
    const objReturn = {};
    let strIPAddr = '';
    if (arrayToken[index]) {
        switch (arrayToken[index]) {
        case 'host':
            // Host address has to be IPv4 or IPv6. FQDN can not configure on ACE.
            ++index;
            if (g_Name[arrayToken[index]]) {
                strIPAddr = g_Name[arrayToken[index]].address + (g_Name[arrayToken[index]].address.indexOf(':') == -1 ? '/32' : '/128');
            } else {
                strIPAddr = normalizeHostAddr(arrayToken[index]);
            }
            ++index;
            break;
        case 'any':
            strIPAddr = '0/0';
            ++index;
            break;
        case 'any4':
            strIPAddr = '0.0.0.0/0';
            ++index;
            break;
        case 'any6':
            strIPAddr = '0000:0000:0000:0000:0000:0000:0000:0000/0';
            ++index;
            break;
        default:
            // 'IPv4_address IPv4_mask' or 'IPv6_address/IPv6_prefix'
            if (arrayToken[index].indexOf('/') == -1) { // IPv4.
                strIPAddr = getIPv4AddrWithPrefixLength(g_Name[arrayToken[index]] ? g_Name[arrayToken[index]].address : arrayToken[index], arrayToken[index+1]);
                index += 2;
            } else { // IPv6.
                let arrayStrIPv6 = arrayToken[index].split('/');
                if (g_Name[arrayStrIPv6[0]]) {
                    strIPAddr = g_Name[arrayStrIPv6[0]].address + '/' + arrayStrIPv6[1];
                } else {
                    strIPAddr = getIPv6FullRepresentedAddrWithPrefixLength(arrayToken[index]);
                }
                ++index;
            }
        }
    }
    objReturn['value'] = strIPAddr;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves the network address from object-group tokens and
* returns the normalized network address string. IPv4 address is changed to
* the CIDR format, and IPv6 address is adapted to the full represented. It is
* not changed if the network address is FQDN. The return string is '' if the
* network address does not exist. The address type 'object', 'object-group',
* and 'interface' are never passed to this function.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Object}
*   An associative array of the normalized string of network address and the
*   next index of the object-group token.
*
* @example
*   Variables state when calls.
*   ---------------------------------------------------------------------------------------
*   g_Name['ADDR1'] = { address:'y.y.y.y', description:'' }
*   g_Name['ADDR2'] = { address:'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy', description:'' }
*
*   arrayToken             index    Return['value']                               Return['next_index']
*   --------------------------------------------------------------------------------------------------
*   ['host','x.x.x.x']     0     -> 'x.x.x.x/32'                                  2
*   ['host','x:x:x::x']    0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/128' 2
*   ['host','example.com'] 0     -> 'example.com'                                 2
*   ['host','ADDR1']       0     -> 'y.y.y.y/32'                                  2
*   ['host','ADDR2']       0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/128' 2
*   ['x.x.x.x','m.m.m.m']  0     -> 'x.x.x.x/nn'                                  2
*   ['ADDR1','m.m.m.m']    0     -> 'y.y.y.y/nn'                                  2
*   ['x:x:x::x/nn']        0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/nn'  1
*   ['ADDR2/nn']           0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/nn'  1
*   ['example.com']        0     -> 'example.com'                                 1
*   []                     0     -> ''                                            0
*/
function extractIPAddrFromNetworkObjectGroup(arrayToken, index) {
    const objReturn = {};
    let strIPAddr = '';
    if (arrayToken[index]) {
        if (arrayToken[index] === 'host') {
            // Host address can configure IPv4, IPv6 and FQDN.
            ++index;
            if (g_Name[arrayToken[index]]) {
                strIPAddr = g_Name[arrayToken[index]].address + (g_Name[arrayToken[index]].address.indexOf(':') == -1 ? '/32' : '/128');
            } else {
                strIPAddr = normalizeHostAddr(arrayToken[index]);
            }
            ++index;
        } else {
            // 'IPv4_address IPv4_mask', 'IPv6_address/IPv6_prefix' or 'FQDN'.
            if (arrayToken[index].indexOf('/') != -1) { // IPv6.
                let arrayStrIPv6 = arrayToken[index].split('/');
                if (g_Name[arrayStrIPv6[0]]) {
                    strIPAddr = g_Name[arrayStrIPv6[0]].address + '/' + arrayStrIPv6[1];
                } else {
                    strIPAddr = getIPv6FullRepresentedAddrWithPrefixLength(arrayToken[index]);
                }
                ++index;
            } else if (!arrayToken[index+1]) { // FQDN.
                strIPAddr = arrayToken[index];
                ++index;
            } else {
                strIPAddr = getIPv4AddrWithPrefixLength(g_Name[arrayToken[index]] ? g_Name[arrayToken[index]].address : arrayToken[index], arrayToken[index+1]);
                index += 2;
            }
        }
    }
    objReturn['value'] = strIPAddr;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves the network address from ACE tokens and returns the
* normalized network address string. IPv4 address is changed to the CIDR
* format, and IPv6 address is adapted to the full represented. It is '0/0' if
* the network address is 'any', and it is not changed if FQDN. The return
* string is its name if the network address is 'object' or 'object-group', and
* is 'undefined' if the address type is 'interface'. It is '' if the network
* address does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Object}
*   An associative array of the normalized string of network address and the
*   next index of the ACE token.
*
* @example
*   arrayToken                                index    Return['value']                               Return['next_index']
*   ---------------------------------------------------------------------------------------------------------------------
*   ['x.x.x.x','m.m.m.m']                     0     -> 'x.x.x.x/nn'                                  2
*   ['ADDR1','m.m.m.m']                       0     -> 'y.y.y.y/nn'                                  2
*   ['x:x:x::x/nn']                           0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/nn'  1
*   ['ADDR2/nn']                              0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/nn'  1
*   ['host','x.x.x.x']                        0     -> 'x.x.x.x/32'                                  2
*   ['host','x:x:x::x']                       0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/128' 2
*   ['host','ADDR1']                          0     -> 'y.y.y.y/32'                                  2
*   ['host','ADDR2']                          0     -> 'yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy/128' 2
*   ['any']                                   0     -> '0/0'                                         1
*   ['any4']                                  0     -> '0.0.0.0/0'                                   1
*   ['any6']                                  0     -> '0000:0000:0000:0000:0000:0000:0000:0000/0'   1
*   ['object','NetworkObjectName']            0     -> 'NetworkObjectName'                           2
*   ['object-group','NetworkObjectGroupName'] 0     -> 'NetworkObjectGroupName'                      2
*   ['object','UNKNOWN']                      0     -> 'UNKNOWN'                                     2
*   ['object-group','UNKNOWN']                0     -> 'UNKNOWN'                                     2
*   ['interface']                             0     -> 'undefined'                                   0
*   []                                        0     -> ''                                            0
*/
function extractObjectNameOrObjectGroupNameOrAddressFromAce(arrayToken, index) {
    const objReturn = {};
    let strValue = '';
    if (arrayToken[index]) {
        switch (arrayToken[index]) {
        case 'object':
        case 'object-group':
            strValue = arrayToken[++index];
            ++index;
            break;
        case 'interface':
        case 'object-group-security':
        case 'object-group-user':
        case 'security-group':
        case 'user':
        case 'user-group':
            // TODO: Support the above types.
            strValue = 'undefined';
            index += 2;
            break;
        default:
            const objIPAddr = extractIPAddrFromAce(arrayToken, index);
            strValue = objIPAddr['value'];
            index = objIPAddr['next_index'];
            break;
        }
    }
    objReturn['value'] = strValue;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves port condition from ACE tokens and returns the
* normalized port condition string. The return string is the object-group name
* if the port condition is 'object-group'. It is 'eq/any' if the port
* condition is not recognized or does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @param {number} intPortType
* @return {Object}
*   An associative array of the normalized string of port condition and the
*   next index of the ACE token.
*
* @example
*   arrayToken                                index intPortType          Return['value']       Return['next_index']
*   ---------------------------------------------------------------------------------------------------------------
*   ['eq','https']                            0     PORT_TYPE_TCP_UDP -> 'eq/443'              2
*   ['eq','80']                               0     PORT_TYPE_TCP_UDP -> 'eq/80'               2
*   ['lt','21']                               0     PORT_TYPE_TCP_UDP -> 'lt/21'               2
*   ['eq','www']                              0     PORT_TYPE_TCP_UDP -> 'eq/80'               2
*   ['eq','www']                              0     PORT_TYPE_TCP     -> 'eq/80'               2
*   ['eq','www']                              0     PORT_TYPE_UDP     -> 'eq/80'               2
*   ['eq','rsh']                              0     PORT_TYPE_TCP_UDP -> 'eq/rsh'              2
*   ['eq','rsh']                              0     PORT_TYPE_TCP     -> 'eq/514'              2
*   ['eq','rsh']                              0     PORT_TYPE_UDP     -> 'eq/rsh'              2
*   ['eq','syslog']                           0     PORT_TYPE_TCP_UDP -> 'eq/syslog'           2
*   ['eq','syslog']                           0     PORT_TYPE_TCP     -> 'eq/syslog'           2
*   ['eq','syslog']                           0     PORT_TYPE_UDP     -> 'eq/514'              2
*   ['range','20','21']                       0     PORT_TYPE_TCP_UDP -> 'range/20-21'         3
*   ['neq','UNKNOWN']                         0     PORT_TYPE_TCP_UDP -> 'neq/UNKNOWN'         2
*   ['object-group','PortObjectGroupName']    0     PORT_TYPE_TCP_UDP -> 'PortObjectGroupName' 2
*   ['object-group','NetworkObjectGroupName'] 0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['object-group','UNKNOWN']                0     PORT_TYPE_TCP_UDP -> 'UNKNOWN'             2
*   ['host']                                  0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['any']                                   0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['x.x.x.x']                               0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['x:x:x::x']                              0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['log']                                   0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   ['UNKNOWN']                               0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*   []                                        0     PORT_TYPE_TCP_UDP -> 'eq/any'              0
*/
function extractPortConditionOrObjectGroupNameFromAce(arrayToken, index, intPortType) {
    const objReturn = {};
    let strValue = 'eq/any';
    if (arrayToken[index]) {
        if (arrayToken[index] === 'object-group') {
            if (g_ObjectGroup_Network[arrayToken[index+1]]) { // network object-group.
                strValue = 'eq/any';
            } else { // service or port object-group.
                strValue = arrayToken[index+1];
                index += 2;
            }
        } else {
            const objPortCondition = extractPortConditionFromAce(arrayToken, index, intPortType);
            if (objPortCondition['next_index'] > index) {
                strValue = objPortCondition['value'];
                index = objPortCondition['next_index'];
            }
        }
    }
    objReturn['value'] = strValue;
    objReturn['next_index'] = index;
    return objReturn;
}

/**
* This function retrieves icmp-type and icmp-code from ACE tokens and returns
* the normalized icmp-type number and icmp-code string. The return string is
* the object-group name if the icmp-type is 'object-group'. It is 'any/any' if
* the icmp-type is not recognized or does not exist.
*
* @param {Array} arrayToken
* @param {number} index
* @param {boolean} boolIcmp6
* @return {Object}
*   An associative array of the normalized string of icmp-type and icmp-code
*   and the next index of the ACE token.
*
* @example
*   arrayToken                                 index boolIcmp6    Return['value']           Return['next_index']
*   ------------------------------------------------------------------------------------------------------------
*   ['0','255']                                0     false     -> '0/255'                   2
*   ['echo','255']                             0     false     -> '8/255'                   2
*   ['echo','255']                             0     true      -> '128/255'                 2
*   ['object-group','IcmpTypeObjectGroupName'] 0     false     -> 'IcmpTypeObjectGroupName' 2
*   ['object-group','UNKNOWN']                 0     false     -> 'UNKNOWN'                 2
*   ['0']                                      0     false     -> '0/any'                   1
*   ['echo']                                   0     false     -> '8/any'                   1
*   ['echo']                                   0     true      -> '128/any'                 1
*   ['0','log']                                0     false     -> '0/any'                   1
*   ['echo','log']                             0     false     -> '8/any'                   1
*   ['echo','log']                             0     true      -> '128/any'                 1
*   ['log']                                    0     false     -> 'any/any'                 0
*   ['UNKNOWN']                                0     false     -> 'any/any'                 0
*   []                                         0     false     -> 'any/any'                 0
*/
function extractIcmpTypeAndCodeFromAceOrObjectGroupNameFromAce(arrayToken, index, boolIcmp6) {
    const objReturn = {};
    let strValue = 'any/any';
    if (arrayToken[index]) {
        if (arrayToken[index] === 'object-group') {
            strValue = arrayToken[index+1]; // object-group name.
            index += 2;
        } else {
            const objIcmpTypeAndCode = extractIcmpTypeAndCodeFromAce(arrayToken, index, boolIcmp6);
            strValue = objIcmpTypeAndCode['value'];
            index = objIcmpTypeAndCode['next_index'];
        }
    }
    objReturn['value'] = strValue;
    objReturn['next_index'] = index;
    return objReturn;
}

/*
* ============================================================================
* Normalization functions
* ============================================================================
*/

/**
* This function normalizes the host address and returns the normalized string.
* If the host address is IPv4 address, it is changed to CIDR format. If the
* host address is IPv6 address, it is adapted to the full represented. No
* changes if the host address is FQDN.
*
* @param {string} strHostAddr
* @return {string} The normalized host address.
*
*/
function normalizeHostAddr(strHostAddr) {
    if (strHostAddr.indexOf(':') != -1) { // IPv6.
        return getIPv6FullRepresentedAddrWithPrefixLength(strHostAddr + '/128');
    }
    if (strHostAddr.match(/^\d+\.\d+\.\d+\.\d+$/)) { // IPv4.
        return (strHostAddr + '/32');
    }
    // FQDN.
    return strHostAddr;
}

/**
* This function normalizes the network address of a name and returns the
* normalized string. IPv6 address is adapted to the full represented. IPv4
* address and FQDN are not changed.
*
* @param {Array} arrayToken
* @param {number} index
* @return {string} The normalized name.
*
* @example
*   arrayToken       index    Return
*   -------------------------------------------------------------------
*   ['x.x.x.x']      0     -> 'x.x.x.x'
*   ['x:x:x::x']     0     -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx'
*   ['example.com']  0     -> 'example.com'
*   ['UNKNOWN']      0     -> 'UNKNOWN'
*   []               0     -> ''
*/
function normalizeNameAddr(arrayToken, index) {
    let strNormalizedNameAddr = '';
    if (arrayToken[index]) {
        if (arrayToken[index].indexOf(':') != -1) { // IPv6.
            strNormalizedNameAddr = getIPv6FullRepresentedAddr(arrayToken[index]);
        } else { // IPv4 or others.
            strNormalizedNameAddr = arrayToken[index];
        }
    }
    return strNormalizedNameAddr;
}

/**
* This function normalizes the network address of a network object and returns
* the normalized string. IPv4 address of host and subnet are changed to CIDR
* format. The IP addresses of the range are combined with '-'. IPv6 address is
* adapted to the full represented. FQDN is not changed.
*
* @param {Array} arrayToken
* @return {string} The normalized network object.
*
* @example
*   arrayToken                          Return
*   ---------------------------------------------------------------------------------------------------------------------
*   ['host','x.x.x.x']               -> 'x.x.x.x/32'
*   ['host','x:x:x::x']              -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/128'
*   ['subnet','x.x.x.x','m.m.m.m']   -> 'x.x.x.x/nn'
*   ['subnet','x:x:x::x/nn']         -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx/nn'
*   ['range','x.x.x.x','y.y.y.y']    -> 'x.x.x.x-y.y.y.y'
*   ['range','x:x:x::x','y:y:y::yy'] -> 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx-yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy'
*   ['fqdn','example.com']           -> 'example.com'
*   ['fqdn','v4','example.com']      -> 'example.com'
*   ['fqdn','v6','example.com']      -> 'example.com'
*   ['nat']                          -> 'undefined'
*   ['host']                         -> 'undefined'
*   ['subnet']                       -> 'undefined'
*   ['range']                        -> 'undefined'
*   ['fqdn']                         -> 'undefined'
*   ['fqdn','v4']                    -> 'undefined'
*   ['fqdn','v6']                    -> 'undefined'
*   ['UNKNOWN']                      -> 'UNKNOWN'
*   []                               -> ''
*/
function normalizeNetworkObject(arrayToken) {
    let strNormalizedNetworkObject = '';
    if (arrayToken[0]) {
        switch (arrayToken[0]) {
        case 'host':
            // Host address has to be IPv4 and IPv6. FQDN can not configure on network object.
            strNormalizedNetworkObject = arrayToken[1] ? normalizeHostAddr(arrayToken[1]) : 'undefined';
            break;
        case 'subnet':
            if (arrayToken[1]) {
                if (arrayToken[1].indexOf(':') == -1) { // IPv4.
                    strNormalizedNetworkObject = getIPv4AddrWithPrefixLength(arrayToken[1], arrayToken[2]);
                } else {
                    strNormalizedNetworkObject = getIPv6FullRepresentedAddrWithPrefixLength(arrayToken[1]);
                }
            } else {
                strNormalizedNetworkObject = 'undefined';
            }
            break;
        case 'range':
            if (arrayToken[1]) {
                if (arrayToken[1].indexOf(':') == -1) { // IPv4.
                    strNormalizedNetworkObject = arrayToken[1] + '-' + arrayToken[2];
                } else { // IPv6.
                    strNormalizedNetworkObject = getIPv6FullRepresentedAddr(arrayToken[1]) + '-' + getIPv6FullRepresentedAddr(arrayToken[2]);
                }
            } else {
                strNormalizedNetworkObject = 'undefined';
            }
            break;
        case 'fqdn':
            if (arrayToken[1]) {
                if (arrayToken[1] === 'v4' || arrayToken[1] === 'v6') {
                    strNormalizedNetworkObject = arrayToken[2] ? arrayToken[2] : 'undefined';
                } else {
                    strNormalizedNetworkObject = arrayToken[1];
                }
            } else {
                strNormalizedNetworkObject = 'undefined';
            }
            break;
        case 'nat':
            // TODO: Support nat address type.
            strNormalizedNetworkObject = 'undefined';
            break;
        default: // Unknown address type.
            strNormalizedNetworkObject = arrayToken[0];
            break;
        }
    }
    return strNormalizedNetworkObject;
}

/**
* This function normalizes a service object and returns the normalized string.
* The normalize targets are the following.
*
*   - protocol
*   - icmp-type and icmp-code
*   - tcp and udp's operator and port
*
* Protocol names (except 'ip'), port names, and icmp-type names are converted
* to those number string. Returns as-is if 'ip' or unknown protocol.
*
* @param {Array} arrayToken
* @param {number} index
* @return {string} The normalized service object.
*
* @example
*   ip:
*       arrayToken   index    Return
*       ----------------------------
*       ['ip']       0     -> 'ip'
*   icmp or icmp6:
*       arrayToken             index    Return
*       -------------------------------------------
*       ['icmp']               0     -> '1/any/any'
*       ['icmp6','0','255']    0     -> '58/0/255'
*       ['1','echo','255']     0     -> '1/8/255'
*       ['58','0']             0     -> '58/0/any'
*       ['1','echo']           0     -> '1/8/any'
*       ['icmp','0','log']     0     -> '1/0/any'
*       ['icmp','echo','log']  0     -> '1/8/any'
*       ['icmp6','echo','log'] 0     -> '58/128/any'
*       ['icmp','log']         0     -> '1/any/any'
*       ['icmp','UNKNOWN']     0     -> '1/any/any'
*   tcp or udp:
*       arrayToken                                                                  index    Return
*       -------------------------------------------------------------------------------------------------------------------------
*       ['tcp']                                                                     0     -> '6/eq/any/eq/any'
*       ['udp','source','gt','100']                                                 0     -> '17/gt/100/eq/any'
*       ['17','source','neq','65535','destination','eq','domain']                   0     -> '17/neq/65535/eq/53'
*       ['udp','source','range','10000','20000','destination','eq','123']           0     -> '17/range/10000-20000/eq/123'
*       ['6','source','range','10000','20000','destination','range','http','https'] 0     -> '6/range/10000-20000/range/80-443'
*       ['udp','destination','lt','syslog']                                         0     -> '17/eq/any/lt/514'
*       ['tcp','source','eq','http']                                                0     -> '6/eq/80/eq/any'
*       ['tcp','source','range','10000','20000']                                    0     -> '6/range/10000-20000/eq/any'
*       ['tcp','destination','range','20','ftp']                                    0     -> '6/eq/any/range/20-21'
*       ['tcp','source','range','https','444']                                      0     -> '6/range/443-444/eq/any'
*       ['tcp','destination','gt']                                                  0     -> '6/eq/any/gt/undefined'
*       ['tcp','source','neq','UNKNOWN']                                            0     -> '6/neq/UNKNOWN/eq/any'
*       ['tcp','destination','range']                                               0     -> '6/eq/any/range/undefined-undefined'
*       ['tcp','source','range','10000']                                            0     -> '6/range/10000-undefined/eq/any'
*       ['tcp','destination','range','10000','UNKNOWN']                             0     -> '6/eq/any/range/10000-UNKNOWN'
*       ['tcp','source','range','UNKNOWN']                                          0     -> '6/range/UNKNOWN-undefined/eq/any'
*       ['tcp','destination','log']                                                 0     -> '6/eq/any/eq/any'
*       ['tcp','source','UNKNOWN']                                                  0     -> '6/eq/any/eq/any'
*       ['tcp','destination']                                                       0     -> '6/eq/any/eq/any'
*   others:
*       arrayToken   index    Return
*       ----------------------------
*       ['0']        0     -> '0'
*       ['ospf']     0     -> '89'
*       []           0     -> ''
*/
function normalizeServiceObject(arrayToken, index) {
    let strNormalizedServiceObject = '';
    if (arrayToken[index]) {
        const objProtocol = extractProtocolFromAce(arrayToken, index++);
        const strProtocolNumber = objProtocol['value'];
        switch (strProtocolNumber) {
        case 'ip':
            strNormalizedServiceObject = strProtocolNumber;
            break;
        case '1':
        case '58':
            {
                const objIcmpTypeAndCode = extractIcmpTypeAndCodeFromAce(arrayToken, index, strProtocolNumber === '58');
                strNormalizedServiceObject = strProtocolNumber + '/' + objIcmpTypeAndCode['value'];
            }
            break;
        case '6':
        case '17':
            {
                const intPortType = strProtocolNumber === '6' ? PORT_TYPE_TCP : PORT_TYPE_UDP;
                let strSrcPort = 'eq/any';
                let strDstPort = 'eq/any';
                if (arrayToken[index]) {
                    if ((arrayToken.length - index) >= 6) { // Source and Destination exist.
                        if (arrayToken[index] === 'source' && isOperator(arrayToken[index+1])) {
                            const objPortCondition = extractPortConditionFromAce(arrayToken, index+1, intPortType);
                            strSrcPort = objPortCondition['value'];
                        } else {
                            console.warn(`Invalid keyword of the source operator. ${arrayToken}`);
                        }
                        index += (strSrcPort.substring(0, 5) === 'range') ? 4 : 3;
                        if (arrayToken[index] === 'destination' && isOperator(arrayToken[index+1])) {
                            const objPortCondition = extractPortConditionFromAce(arrayToken, index+1, intPortType);
                            strDstPort = objPortCondition['value'];
                        } else {
                            console.warn(`Invalid keyword of the destination operator. ${arrayToken}`);
                        }
                    } else if (arrayToken[index] === 'source' && isOperator(arrayToken[index+1])) {
                        const objPortCondition = extractPortConditionFromAce(arrayToken, index+1, intPortType);
                        strSrcPort = objPortCondition['value'];
                    } else if (arrayToken[index] === 'destination' && isOperator(arrayToken[index+1])) {
                        const objPortCondition = extractPortConditionFromAce(arrayToken, index+1, intPortType);
                        strDstPort = objPortCondition['value'];
                    } else {
                        console.warn(`Invalid keyword in service object. ${arrayToken}`);
                    }
                } else { // Only protocol exists.
                    // No change the source and the destination ports.
                }
                strNormalizedServiceObject = strProtocolNumber + '/' + strSrcPort + '/' + strDstPort;
            }
            break;
        default: // Unsupported protocol.
            // Change only protocol number.
            strNormalizedServiceObject = strProtocolNumber;
            break;
        }
    }
    return strNormalizedServiceObject;
}

/*
* ============================================================================
* Name, Object, and Object-group list
* ============================================================================
*/

/**
* This function normalizes the ip address of the all names in configuration
* text. All normalized ip addresses are saved into g_Name. IPv4 address is not
* changed. Non-ip address, such as FQDN, is saved as is.
* See normalizeNameAddr function for detail.
*
* @param {string} configToFlat
*
* @example
*   configToFlat
*   ------------------------------------------------
*   name 192.168.0.1 ADDR1
*   name 192.168.0.0 ADDR2 description IPv4 Segment.
*   name 2001:db8::1 ADDR3
*   name 2001:db8:: ADDR4 description IPv6 Segment.
*   name example.com ADDR5
*   name UNKNOWN ADDR6 description Unknown address.
*   name NoName
*   name
*
*      Results of g_Name
*   -------------------------------------------------------------------------------------------------------
*   -> g_Name['ADDR1'] = { address:'192.168.0.1', description:'' }
*      g_Name['ADDR2'] = { address:'192.168.0.0', description:'IPv4 Segment.' }
*      g_Name['ADDR3'] = { address:'2001:0db8:0000:0000:0000:0000:0000:0001', description:'' }
*      g_Name['ADDR4'] = { address:'2001:0db8:0000:0000:0000:0000:0000:0000', description:'IPv6 Segment.' }
*      g_Name['ADDR5'] = { address:'example.com', description:'' }
*      g_Name['ADDR6'] = { address:'UNKNOWN', description:'Unknown address.' }
*/
function makeAsaNameList(configToFlat) {
    const arrayText = configToFlat.split(/\r\n|\r|\n/);

    g_Name = {};

    for (let i=0; i<arrayText.length; ++i) {
        let strLine = arrayText[i];

        // Skip if white line.
        if (strLine.length == 0) {
            continue;
        }

        // Extract the head character of the line.
        const strHeadChar = strLine.substring(0, 1);

        // Skip if comment line.
        if (strHeadChar === '!') {
            continue;
        }

        // Trim a line feed at the tail and trim white spaces at both head and tail.
        strLine = strLine.trim();

        // Split by whitespaces.
        const arrayToken = strLine.split(/\s+/);

        // Find the 'name' line.
        if (arrayToken[0] === 'name') {
            let strDesc = '';
            if (arrayToken[4]) {
                strDesc = strLine.substring(strLine.indexOf('description') + 12);
            }
            if (arrayToken[2]) {
                g_Name[arrayToken[2]] = { address: normalizeNameAddr(arrayToken, 1), description: strDesc };
            }
        } else {
            // Skip if not the name line.
        }
    }
}

/**
* This function normalizes all network objects and service objects in
* configuration text. All normalized network objects are saved into
* g_Object_Network, and all normalized service objects are saved in
* g_Object_Service.
* See normalizeNetworkObject and normalizeServiceObject functions for detail.
*
* @param {string} configToFlat
*
* @example
*   configToFlat
*   ---------------------------------
*   object network ADDR1
*    host 192.168.0.1
*   object network ADDR2
*    subnet 192.168.0.0 255.255.255.0
*   object network ADDR3
*    range 192.168.0.1 192.168.0.100
*   object network ADDR4
*    host 2001:db8::1
*   object network ADDR5
*    subnet 2001:db8::/64
*   object network ADDR6
*    range 2001:db8::1 2001:db8::100
*   object network ADDR7
*    fqdn example.com
*   object service SRVC1
*    service ip
*   object service SRVC2
*    service icmp
*   object service SRVC3
*    service tcp source range 10000 20000 destination range http https
*   object service SRVC4
*    service udp source neq 65535 destination eq domain
*
*      Results of g_Object_Network and g_Object_Service
*   ----------------------------------------------------------------------------------------------------------------
*   -> g_Object_Network['ADDR1'] = '192.168.0.1/32'
*      g_Object_Network['ADDR2'] = '192.168.0.0/24'
*      g_Object_Network['ADDR3'] = '192.168.0.1-192.168.0.100'
*      g_Object_Network['ADDR4'] = '2001:0db8:0000:0000:0000:0000:0000:0001/128'
*      g_Object_Network['ADDR5'] = '2001:0db8:0000:0000:0000:0000:0000:0000/64'
*      g_Object_Network['ADDR6'] = '2001:0db8:0000:0000:0000:0000:0000:0001-2001:0db8:0000:0000:0000:0000:0000:0100'
*      g_Object_Network['ADDR7'] = 'example.com'
*      g_Object_Service['SRVC1'] = 'ip'
*      g_Object_Service['SRVC2'] = '1/any/any'
*      g_Object_Service['SRVC3'] = '6/range/10000-20000/range/80-443'
*      g_Object_Service['SRVC4'] = '17/neq/65535/eq/53'
*/
function makeAsaObjectList(configToFlat) {
    const arrayText = configToFlat.split(/\r\n|\r|\n/);

    g_Object_Network = {};
    g_Object_Service = {};
    let strKey = '';
    let intObjectType = OBJECT_TYPE_UNKNOWN;

    for (let i=0; i<arrayText.length; ++i) {
        let strLine = arrayText[i];

        // Skip if white line.
        if (strLine.length == 0) {
            strKey = '';
            continue;
        }

        // Extract the head character of the line.
        const strHeadChar = strLine.substring(0, 1);

        // Skip if comment line.
        if (strHeadChar === '!') {
            strKey = '';
            continue;
        }

        // Clear strKey if section end.
        if (strHeadChar !== ' ') {
            strKey = '';
        }

        // Trim a line feed at the tail and trim white spaces at both head and tail.
        strLine = strLine.trim();

        // Split by whitespaces.
        const arrayToken = strLine.split(/\s+/);

        // Find the 'object' line and parse it.
        if (strKey === '') {
            // Find the 'object line'.
            if (arrayToken[0] === 'object') {
                strKey = arrayToken[2]; // object name.
                if (t_AsaObjectType[arrayToken[1]]) {
                    intObjectType = t_AsaObjectType[arrayToken[1]];
                } else {
                    console.warn(`Unknown object type. ${arrayToken}`);

                    // Skip the unknown object type line.
                    // Also, skip this object type section. -->(A)
                    intObjectType = OBJECT_TYPE_UNKNOWN;
                }
            } else {
                // Skip if not the object line.
            }
        } else {
            // Parse the object type section.
            switch (intObjectType) {
            case OBJECT_TYPE_NETWORK:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else {
                    g_Object_Network[strKey] = normalizeNetworkObject(arrayToken);
                }
                break;
            case OBJECT_TYPE_SERVICE:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'service') {
                    g_Object_Service[strKey] = normalizeServiceObject(arrayToken, 1);
                } else {
                    console.warn(`Invalid keyword in service object. ${arrayToken}`);
                }
                break;
            default:
                // Skip the unknown object type section. <--(A)
                break;
            }
        }
    }
}

/**
* This function normalizes and flattens all object-groups in configuration
* text. The flattened object-group are saved into g_ObjectGroup_Network,
* g_ObjectGroup_Protocol, g_ObjectGroup_IcmpType,
* g_ObjectGroup_Service, and g_ObjectGroup_Port. (g_ObjectGroup_Port
* is service object-group designated by tcp, udp, or tcp-udp.) If the type of
* service-object in service object-group is 'tcp-udp', both tcp service string
* and udp service string are saved into g_ObjectGroup_Service.
*
* @param {string} configToFlat
*
* @example
*   Variables state when calls.
*   ---------------------------------------------------------------------------------------
*   g_Name['NAME11'] = { address:'192.168.1.1', description:'' }
*   g_Name['NAME12'] = { address:'192.168.1.0', description:'' }
*   g_Name['NAME21'] = { address:'2001:0db8:1001:1002:1003:1004:1005:1006', description:'' }
*   g_Name['NAME22'] = { address:'2001:0db8:1001:1002:0000:0000:0000:0000', description:'' }
*
*   configToFlat
*   ------------------------------------------------
*   object-group protocol PROTG1
*    protocol-object ip
*   object-group icmp-type ICMPG1
*    icmp-object echo
*   object-group network ADDRG1
*    network-object host 192.168.0.1
*    network-object 2001:db8::/64
*    network-object example.com
*    network-object host NAME11
*    network-object NAME12 255.255.255.0
*    network-object host NAME21
*    network-object NAME22/64
*   object-group service SRVCG1
*    service-object tcp
*    service-object tcp-udp source range 20001 20199
*    service-object udp destination gt syslog
*   object-group service PORTG1 tcp
*    port-object eq 0
*    port-object range http 81
*
*      Results of g_ObjectGroup_Protocol, g_ObjectGroup_IcmpType, g_ObjectGroup_Network, g_ObjectGroup_Service, and g_ObjectGroup_Port
*   ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   -> g_ObjectGroup_Protocol['PROTG1'] = ['0']
*      g_ObjectGroup_IcmpType['ICMPG1'] = ['8']
*      g_ObjectGroup_Network['ADDRG1']  = ['192.168.0.1/32', '2001:0db8:0000:0000:0000:0000:0000:0000/64', 'example.com', '192.168.1.1/32', '192.168.1.0/24', '2001:0db8:1001:1002:1003:1004:1005:1006/128', '2001:0db8:1001:1002:0000:0000:0000:0000/64']
*      g_ObjectGroup_Service['SRVCG1']  = ['6/eq/any/eq/any', '6/range/20001-20199/eq/any', '17/range/20001-20199/eq/any', '17/eq/any/gt/514']
*      g_ObjectGroup_Port['PORTG1']     = ['eq/0', 'range/80-81']
*/
function makeAsaObjectGroupList(configToFlat) {
    const arrayText = configToFlat.split(/\r\n|\r|\n/);

    g_ObjectGroup_Network = {};
    g_ObjectGroup_Service = {};
    g_ObjectGroup_Port = {};
    g_ObjectGroup_Protocol = {};
    g_ObjectGroup_IcmpType = {};
    let strKey = '';
    let intObjectGroupType = OBJECT_GROUP_TYPE_UNKNOWN;
    let intPortGroupType = PORT_TYPE_UNKNOWN;

    for (let i=0; i<arrayText.length; ++i) {
        let strLine = arrayText[i];

        // Skip if white line.
        if (strLine.length == 0) {
            strKey = '';
            continue;
        }

        // Extract the head character of the line.
        const strHeadChar = strLine.substring(0, 1);

        // Skip if comment line.
        if (strHeadChar === '!') {
            strKey = '';
            continue;
        }

        // Clear strKey if section end.
        if (strHeadChar !== ' ') {
            strKey = '';
        }

        // Trim a line feed at the tail and trim white spaces at both head and tail.
        strLine = strLine.trim();

        // Split by whitespaces.
        const arrayToken = strLine.split(/\s+/);

        // Find the 'object-group' line and parse it.
        if (strKey === '') {
            // Find the 'object-group' line.
            if (arrayToken[0] === 'object-group') {
                strKey = arrayToken[2]; // object-group name.
                if (t_AsaObjectGroupType[arrayToken[1]]) {
                    intObjectGroupType = t_AsaObjectGroupType[arrayToken[1]];
                    if (intObjectGroupType == OBJECT_GROUP_TYPE_SERVICE && arrayToken[3]) {
                        intObjectGroupType = OBJECT_GROUP_TYPE_PORT;
                        intPortGroupType = arrayToken[3] === 'tcp-udp' ? PORT_TYPE_TCP_UDP : arrayToken[3] === 'tcp' ? PORT_TYPE_TCP : PORT_TYPE_UDP;
                    }
                } else {
                    console.warn(`Unknown object-group type. ${arrayToken}`);

                    // Skip the unknown object-group type line.
                    // Also, skip this object-group type section. -->(B)
                    intObjectGroupType = OBJECT_GROUP_TYPE_UNKNOWN;
                }
            } else {
                // Skip if not the object-group line.
            }
        } else {
            // Parse the object-group type section.
            switch (intObjectGroupType) {
            case OBJECT_GROUP_TYPE_NETWORK:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'network-object') {
                    let strIPAddress = '';
                    if (arrayToken[1] === 'object') {
                        strIPAddress = g_Object_Network[arrayToken[2]] ? g_Object_Network[arrayToken[2]] : arrayToken[2];
                    } else {
                        const objIPAddr = extractIPAddrFromNetworkObjectGroup(arrayToken, 1);
                        strIPAddress = (objIPAddr['next_index'] == 1) ? (arrayToken[1] ? arrayToken[1] : 'undefined') : objIPAddr['value']; // Set 'undefined' if the next token of 'network-object' does not exist.
                    }
                    if (g_ObjectGroup_Network[strKey]) {
                        g_ObjectGroup_Network[strKey].push(strIPAddress);
                    } else {
                        g_ObjectGroup_Network[strKey] = [strIPAddress];
                    }
                } else if (arrayToken[0] === 'group-object') {
                    const arrayToAppend = g_ObjectGroup_Network[arrayToken[1]] ? g_ObjectGroup_Network[arrayToken[1]].slice() : [arrayToken[1]];
                    if (g_ObjectGroup_Network[strKey]) {
                        Array.prototype.push.apply(g_ObjectGroup_Network[strKey], arrayToAppend);
                    } else {
                        g_ObjectGroup_Network[strKey] = arrayToAppend;
                    }
                } else {
                    console.warn(`Unknown keyword in network object-group. ${arrayToken}`);
                }
                break;
            case OBJECT_GROUP_TYPE_SERVICE:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'service-object') {
                    if (arrayToken[1] === 'tcp-udp') {
                        const arrayTempToken = strLine.split(/\s+/);
                        arrayTempToken[1] = 'tcp';
                        if (g_ObjectGroup_Service[strKey]) {
                            g_ObjectGroup_Service[strKey].push(normalizeServiceObject(arrayTempToken, 1));
                        } else {
                            g_ObjectGroup_Service[strKey] = [normalizeServiceObject(arrayTempToken, 1)];
                        }
                        arrayTempToken[1] = 'udp';
                        g_ObjectGroup_Service[strKey].push(normalizeServiceObject(arrayTempToken, 1));
                    } else {
                        let strService = '';
                        if (arrayToken[1] === 'object') {
                            strService = g_Object_Service[arrayToken[2]] ? g_Object_Service[arrayToken[2]] : arrayToken[2];
                        } else {
                            strService = normalizeServiceObject(arrayToken, 1);
                            if (strService === '') { // Set 'undefined' if the next token of 'service-object' does not exist.
                                strService = 'undefined';
                            }
                        }
                        if (g_ObjectGroup_Service[strKey]) {
                            g_ObjectGroup_Service[strKey].push(strService);
                        } else {
                            g_ObjectGroup_Service[strKey] = [strService];
                        }
                    }
                } else if (arrayToken[0] === 'group-object') {
                    const arrayToAppend = g_ObjectGroup_Service[arrayToken[1]] ? g_ObjectGroup_Service[arrayToken[1]].slice() : [arrayToken[1]];
                    if (g_ObjectGroup_Service[strKey]) {
                        Array.prototype.push.apply(g_ObjectGroup_Service[strKey], arrayToAppend);
                    } else {
                        g_ObjectGroup_Service[strKey] = arrayToAppend;
                    }
                } else {
                    console.warn(`Unknown keyword in service object-group. ${arrayToken}`);
                }
                break;
            case OBJECT_GROUP_TYPE_PORT:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'port-object') {
                    const objPortCondition = extractPortConditionFromAce(arrayToken, 1, intPortGroupType);
                    const strPortCondition = (objPortCondition['next_index'] == 1) ? (arrayToken[1] ? arrayToken[1] : 'undefined') : objPortCondition['value']; // Set 'undefined' if the next token of 'port-object' does not exist.
                    if (g_ObjectGroup_Port[strKey]) {
                        g_ObjectGroup_Port[strKey].push(strPortCondition);
                    } else {
                        g_ObjectGroup_Port[strKey] = [strPortCondition];
                    }
                } else if (arrayToken[0] === 'group-object') {
                    const arrayToAppend = g_ObjectGroup_Port[arrayToken[1]] ? g_ObjectGroup_Port[arrayToken[1]].slice() : [arrayToken[1]];
                    if (g_ObjectGroup_Port[strKey]) {
                        Array.prototype.push.apply(g_ObjectGroup_Port[strKey], arrayToAppend);
                    } else {
                        g_ObjectGroup_Port[strKey] = arrayToAppend;
                    }
                } else {
                    console.warn(`Unknown keyword in port object-group. ${arrayToken}`);
                }
                break;
            case OBJECT_GROUP_TYPE_PROTOCOL:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'protocol-object') {
                    const objProtocol = extractProtocolFromAce(arrayToken, 1);
                    const strProtocol = (objProtocol['next_index'] == 1) ? (arrayToken[1] ? arrayToken[1] : 'undefined') : objProtocol['value']; // Set 'undefined' if the next token of 'protocol-object' does not exist.
                    if (g_ObjectGroup_Protocol[strKey]) {
                        g_ObjectGroup_Protocol[strKey].push(strProtocol);
                    } else {
                        g_ObjectGroup_Protocol[strKey] = [strProtocol];
                    }
                } else if (arrayToken[0] === 'group-object') {
                    const arrayToAppend = g_ObjectGroup_Protocol[arrayToken[1]] ? g_ObjectGroup_Protocol[arrayToken[1]].slice() : [arrayToken[1]];
                    if (g_ObjectGroup_Protocol[strKey]) {
                        Array.prototype.push.apply(g_ObjectGroup_Protocol[strKey], arrayToAppend);
                    } else {
                        g_ObjectGroup_Protocol[strKey] = arrayToAppend;
                    }
                } else {
                    console.warn(`Unknown keyword in protocol object-group. ${arrayToken}`);
                }
                break;
            case OBJECT_GROUP_TYPE_ICMPTYPE:
                if (arrayToken[0] === 'description') {
                    // Skip if description line.
                } else if (arrayToken[0] === 'icmp-object') {
                    const objIcmpType = extractIcmpTypeFromAce(arrayToken, 1, false); // icmp-type object-group is treated as IPv4 icmp.
                    const strIcmpType = (objIcmpType['next_index'] == 1) ? (arrayToken[1] ? arrayToken[1] : 'undefined') : objIcmpType['value']; // Set 'undefined' if the next token of 'icmp-object' does not exist.
                    if (g_ObjectGroup_IcmpType[strKey]) {
                        g_ObjectGroup_IcmpType[strKey].push(strIcmpType);
                    } else {
                        g_ObjectGroup_IcmpType[strKey] = [strIcmpType];
                    }
                } else if (arrayToken[0] === 'group-object') {
                    const arrayToAppend = g_ObjectGroup_IcmpType[arrayToken[1]] ? g_ObjectGroup_IcmpType[arrayToken[1]].slice() : [arrayToken[1]];
                    if (g_ObjectGroup_IcmpType[strKey]) {
                        Array.prototype.push.apply(g_ObjectGroup_IcmpType[strKey], arrayToAppend);
                    } else {
                        g_ObjectGroup_IcmpType[strKey] = arrayToAppend;
                    }
                } else {
                    console.warn(`Unknown keyword in icmp-type object-group. ${arrayToken}`);
                }
                break;
            case OBJECT_GROUP_TYPE_SECURITY:
                // Ignore 'security' object-group.
                break;
            case OBJECT_GROUP_TYPE_USER:
                // Ignore 'user' object-group.
                break;
            default:
                // Skip the unknown object-group type section. <-- (B)
                break;
            }
        }
    }
}

/**
* This function makes protocol type bit list. If the protocol object-group has
* two or more protocol-objects, those each bit are set.
* All service object names and service object-group names are saved with
* PROTOCOL_TYPE_BIT_SERVICE bit.
*
* @example
*   Variables state when calls.
*   -----------------------------------------------------
*   g_ObjectGroup_Protocol['Name1'] = ['ip']
*   g_ObjectGroup_Protocol['Name2'] = ['ip','17']
*   g_Object_Service['Name3'] = 'ip/eq/any/eq/any'
*   g_ObjectGroup_Service['Name4'] = ['tcp/eq/any/lt/80']
*
*      Results of g_ProtocolTypeBit
*   ----------------------------------------------------------------------------------------
*   -> g_ProtocolTypeBit['0']             = PROTOCOL_TYPE_BIT_UNSUPPORTED
*   -> g_ProtocolTypeBit['1']             = PROTOCOL_TYPE_BIT_ICMP
*   -> g_ProtocolTypeBit['2' to '5']      = PROTOCOL_TYPE_BIT_UNSUPPORTED
*   -> g_ProtocolTypeBit['6']             = PROTOCOL_TYPE_BIT_TCP
*   -> g_ProtocolTypeBit['7' to '16']     = PROTOCOL_TYPE_BIT_UNSUPPORTED
*   -> g_ProtocolTypeBit['17']            = PROTOCOL_TYPE_BIT_UDP
*   -> g_ProtocolTypeBit['18' to '57']    = PROTOCOL_TYPE_BIT_UNSUPPORTED
*   -> g_ProtocolTypeBit['58']            = PROTOCOL_TYPE_BIT_ICMP6
*   -> g_ProtocolTypeBit['59' to '255']   = PROTOCOL_TYPE_BIT_UNSUPPORTED
*   -> g_ProtocolTypeBit['ip']            = PROTOCOL_TYPE_BIT_IP
*   -> g_ProtocolTypeBit['icmp']          = PROTOCOL_TYPE_BIT_ICMP
*   -> g_ProtocolTypeBit['icmp6']         = PROTOCOL_TYPE_BIT_ICMP6
*   -> g_ProtocolTypeBit['tcp']           = PROTOCOL_TYPE_BIT_TCP
*   -> g_ProtocolTypeBit['udp']           = PROTOCOL_TYPE_BIT_UDP
*   -> g_ProtocolTypeBit['Name1']         = PROTOCOL_TYPE_BIT_IP
*   -> g_ProtocolTypeBit['Name2']         = PROTOCOL_TYPE_BIT_IP | PROTOCOL_TYPE_BIT_UDP
*   -> g_ProtocolTypeBit['Name3']         = PROTOCOL_TYPE_BIT_SERVICE
*   -> g_ProtocolTypeBit['Name4']         = PROTOCOL_TYPE_BIT_SERVICE
*/
function makeProtocolTypeBitList() {
    g_ProtocolTypeBit = {};

    // Set all protocol numbers as PROTOCOL_TYPE_BIT_UNSUPPORTED to the protocol type bit list.
    for (let i=0; i<256; ++i) {
        g_ProtocolTypeBit[i.toString()] = PROTOCOL_TYPE_BIT_UNSUPPORTED;
    }

    // Overwrite by supported protocol.
    for (const key in t_SupportedProtocolTypeBit) {
        if (t_SupportedProtocolTypeBit.hasOwnProperty(key)) {
            g_ProtocolTypeBit[key] = t_SupportedProtocolTypeBit[key];
        }
    }

    // Append all protocol object-groups' type bits to the protocol type bit list.
    for (const key in g_ObjectGroup_Protocol) {
        if (g_ObjectGroup_Protocol.hasOwnProperty(key)) {
            const array = g_ObjectGroup_Protocol[key];
            let intProtocolTypeBit = PROTOCOL_TYPE_BIT_NONE;
            for (let i=0; i<array.length; ++i) {
                intProtocolTypeBit |= getProtocolTypeBit(array[i]);
            }
            g_ProtocolTypeBit[key] = intProtocolTypeBit;
        }
    }

    // Append all service objects as PROTOCOL_TYPE_BIT_SERVICE to the protocol type bit list.
    for (const key in g_Object_Service) {
        if (g_Object_Service.hasOwnProperty(key)) {
            g_ProtocolTypeBit[key] = PROTOCOL_TYPE_BIT_SERVICE;
        }
    }

    // Append all service object-groups as PROTOCOL_TYPE_BIT_SERVICE to the protocol type bit list.
    for (const key in g_ObjectGroup_Service) {
        if (g_ObjectGroup_Service.hasOwnProperty(key)) {
            g_ProtocolTypeBit[key] = PROTOCOL_TYPE_BIT_SERVICE;
        }
    }
}

/*
* ============================================================================
* ACL Normalization
*
* ACL Normalization normalizes all ACEs to the following format.
*
*   ACL_NAME,ACL_LINE,{standard|extended},{permit|deny},PROT,S_ADDR,S_PORT,D_ADDR,D_PORT,I_TPCD,{active|inactive}
*
*     ACL_NAME     access-list name
*     ACL_LINE     access-list line number
*     PROT         protocol name or number
*     S_ADDR       source network address
*     S_PORT       source port condition
*     D_ADDR       destination network address
*     D_PORT       destination port condition
*     I_TPCD       icmp-type and icmp-code
*
* This format is described as following rules.
*
*  - ACL_NAME and ACL_LINE are the same as configuration.
*  - PROT format is the following. The protocol name except 'ip' is converted
*    to the number. If the protocol name is 'ip', it is not converted.
*
*      'NN'
*      NN: protocol-number or 'ip'
*
*  - S_PORT and D_PORT format are the following. The port name is converted to
*    the number. If PROT is 'ip', 'icmp', or 'icmp6', S_PORT and D_PORT are
*    described as '-/-'. If PROT is tcp or udp and the port condition is not
*    specified, S_PORT and D_PORT are described as 'eq/any'.
*
*      'eq/NN'
*      'lt/NN'
*      'gt/NN'
*      'neq/NN'
*      'range/SN-EN'
*      NN: port-number or 'any'
*      SN: start port-number
*      EN: end port-number
*
*  - I_TPCD format is the following. The icmp-type name is converted to the
*    number. If icmp-type or icmp-code is not specified explicitly, it is
*    described as 'any'. If PROT is 'ip', I_TPCD is described as '-/-'.
*
*      'TN/CN'
*      TN: icmp-type number or 'any'
*      CN: icmp-code number or 'any'
*
*  - S_ADDR and D_ADDR are CIDR representation if the network address is host
*    or subnet address. IPv6 address is adapted to the full represented.
*    If the network address FQDN, it is described as-is. If the network
*    address is a range, S_ADDR and D_ADDR are not CIDR representation. Its
*    address is described in start-address, a hyphen, end-address as
*    following.
*
*      IPv4: 'x.x.x.x-y.y.y.y'
*      IPv6: 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx-yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy'
*
*    'Any' network address is changed as following rules.
*
*      'any': '0/0'
*      'any4': '0.0.0.0/0'
*      'any6': '0000:0000:0000:0000:0000:0000:0000:0000/0'
*
*  - Any object and object-group are not converted to those values.
*  - If the protocol is protocol object-group, service object, or service
*    object-group, S_PORT and D_PORT are described object name or object-group
*    name with the prefix is '?'.
*
* ============================================================================
*/

/**
* This function returns true if the 'inactive' keyword exists.
* Otherwise, it is false.
*
* @param {Array} arrayToken
* @param {number} indexOfLogOrInactive
* @return {boolean}
*   true if the 'inactive' keyword exists.
*   Otherwise, it is false.
*
*/
function isAceInactive(arrayToken, indexOfLogOrInactive) {
    for (let i = indexOfLogOrInactive; i<arrayToken.length; ++i) {
        if (arrayToken[i] === 'inactive') {
            return true;
        }
    }
    return false;
}

/**
* This function normalizes standard ACE and returns its string.
*
* @param {Array} arrayToken
* @param {number} intAclLine
* @return {string} The normalized standard ACE
*
*/
function normalizeStandardAce(arrayToken, intAclLine) {
    let index = 1;
    const strAclName = arrayToken[index++];
    const strAclType = arrayToken[index++];
    const strPermit  = arrayToken[index++];

    // Get the destination address.
    const objReturn = extractObjectNameOrObjectGroupNameOrAddressFromAce(arrayToken, index);
    const strDstIP = objReturn['value'];
    index = objReturn['next_index'];

    // Get the ACL state.
    const strActive = isAceInactive(arrayToken, index) ? 'inactive' : 'active';

    // Return the normalized string.
    return (strAclName + ',' + intAclLine + ',' + strAclType + ',' + strPermit + ',ip,0.0.0.0/0,-/-,' + strDstIP + ',-/-,-/-,' + strActive);
}

/**
* This function normalizes extended ACE and returns its string.
* See the 'ACL Normalization' comment above for detail.
*
* @param {Array} arrayToken
* @param {number} intAclLine
* @return {string} The normalized extended ACE.
*
*/
function normalizeExtendedAce(arrayToken, intAclLine) {
    let index = 1;
    const strAclName    = arrayToken[index++];
    const strAclType    = arrayToken[index++];
    const strPermit     = arrayToken[index++];
    let strProtocol     = '';
    let strSrcIP        = '';
    let strDstIP        = '';
    let strSrcPort      = '';
    let strDstPort      = '';
    let strIcmpTypeCode = '';
    let objReturn     = {};
    let intProtocolTypeBit = PROTOCOL_TYPE_BIT_NONE;
    let boolPortNotAllowed = false;

    // Get the protocol object-group name, service object-group name, service object name, protocol name, or protocol number.
    if (arrayToken[index] === 'object-group') {
        if (g_ObjectGroup_Protocol[arrayToken[index+1]] || g_ObjectGroup_Service[arrayToken[index+1]]) {
            strProtocol = arrayToken[index+1]; // object-group name.
            index += 2;
        }
    } else if (arrayToken[index] === 'object') {
        if (g_Object_Service[arrayToken[index+1]]) {
            strProtocol = arrayToken[index+1]; // object name.
            index += 2;
        }
    } else {
        const objProtocol = extractProtocolFromAce(arrayToken, index++); // protocol name or protocol number.
        strProtocol = objProtocol['value'];
    }

    // Get protocol type bit from protocol string.
    intProtocolTypeBit = g_ProtocolTypeBit[strProtocol];

    // Determine the ACE can use the port. The ACE can not specify the port if IP or multiple protocols.
    boolPortNotAllowed =
        ((intProtocolTypeBit & (PROTOCOL_TYPE_BIT_IP | PROTOCOL_TYPE_BIT_UNSUPPORTED)) > 0 ||
         (intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_TCP)) == (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_TCP) ||
         (intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_UDP)) == (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_UDP) ||
         (intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP6 | PROTOCOL_TYPE_BIT_TCP)) == (PROTOCOL_TYPE_BIT_ICMP6 | PROTOCOL_TYPE_BIT_TCP) ||
         (intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP6 | PROTOCOL_TYPE_BIT_UDP)) == (PROTOCOL_TYPE_BIT_ICMP6 | PROTOCOL_TYPE_BIT_UDP));

    // Get the source address.
    if (arrayToken[index] === 'object-group') {
        if (g_ObjectGroup_Network[arrayToken[index+1]]) {
            strSrcIP = arrayToken[index+1]; // object-group name.
            index += 2;
        }
    } else if (arrayToken[index] === 'object') {
        if (g_Object_Network[arrayToken[index+1]]) {
            strSrcIP = arrayToken[index+1]; // object name.
            index += 2;
        }
    } else {
        objReturn = extractObjectNameOrObjectGroupNameOrAddressFromAce(arrayToken, index);
        strSrcIP = objReturn['value'];
        index = objReturn['next_index'];
    }

    // Get the source port.
    if (boolPortNotAllowed) {
        // Can not specify the source port if multiple protocols.
        strSrcPort = '-/-';
    } else if ((intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_ICMP6)) > 0) {
        strSrcPort = '-/-';
    } else if ((intProtocolTypeBit & (PROTOCOL_TYPE_BIT_TCP | PROTOCOL_TYPE_BIT_UDP)) > 0) {
        if (arrayToken[index] === 'object-group' && g_ObjectGroup_Port[arrayToken[index+1]]) {
            strSrcPort = arrayToken[index+1]; // object-group name.
            index += 2;
        } else {
            objReturn = extractPortConditionOrObjectGroupNameFromAce(arrayToken, index, (intProtocolTypeBit & PROTOCOL_TYPE_BIT_TCP) > 0 ? PORT_TYPE_TCP : PORT_TYPE_UDP);
            strSrcPort = objReturn['value'];
            index = objReturn['next_index'];
        }
    } else if ((intProtocolTypeBit & PROTOCOL_TYPE_BIT_SERVICE) > 0) {
        if (g_ObjectGroup_Port[arrayToken[index+1]]) {
            strSrcPort = arrayToken[index+1]; // object-group name.
            index += 2;
        } else {
            strSrcPort = '?' + strProtocol;
        }
    } else {
        strSrcPort = strProtocol;
    }

    // Get the destination address.
    if (arrayToken[index] === 'object-group') {
        if (g_ObjectGroup_Network[arrayToken[index+1]]) {
            strDstIP = arrayToken[index+1]; // object-group name.
            index += 2;
        }
    } else if (arrayToken[index] === 'object') {
        if (g_Object_Network[arrayToken[index+1]]) {
            strDstIP = arrayToken[index+1]; // object name.
            index += 2;
        }
    } else {
        objReturn = extractObjectNameOrObjectGroupNameOrAddressFromAce(arrayToken, index);
        strDstIP = objReturn['value'];
        index = objReturn['next_index'];
    }

    // Get the destination port if tcp or udp. Get the icmp-type and icmp-code if icmp or icmp6.
    if (boolPortNotAllowed) {
        // Can not specify the destination port, icmp-type, and icmp-code if multiple protocols.
        strDstPort = '-/-';
        strIcmpTypeCode = '-/-';
    } else if ((intProtocolTypeBit & (PROTOCOL_TYPE_BIT_ICMP | PROTOCOL_TYPE_BIT_ICMP6)) > 0) {
        strDstPort = '-/-';
        if (arrayToken[index] === 'object-group') {
            if (g_ObjectGroup_IcmpType[arrayToken[index+1]]) {
                strIcmpTypeCode = arrayToken[index+1]; // object-group name.
                index += 2;
            }
        } else {
            objReturn = extractIcmpTypeAndCodeFromAceOrObjectGroupNameFromAce(arrayToken, index, (intProtocolTypeBit & PROTOCOL_TYPE_BIT_ICMP6) > 0);
            strIcmpTypeCode = objReturn['value'];
            index = objReturn['next_index'];
        }
    } else if ((intProtocolTypeBit & (PROTOCOL_TYPE_BIT_TCP | PROTOCOL_TYPE_BIT_UDP)) > 0) {
        if (arrayToken[index] === 'object-group' && g_ObjectGroup_Port[arrayToken[index+1]]) {
            strDstPort = arrayToken[index+1]; // object-group name.
            index += 2;
        } else {
            objReturn = extractPortConditionOrObjectGroupNameFromAce(arrayToken, index, (intProtocolTypeBit & PROTOCOL_TYPE_BIT_TCP) > 0 ? PORT_TYPE_TCP : PORT_TYPE_UDP);
            strDstPort = objReturn['value'];
            index = objReturn['next_index'];
        }
        strIcmpTypeCode = '-/-';
    } else if ((intProtocolTypeBit & PROTOCOL_TYPE_BIT_SERVICE) > 0) {
        if (g_ObjectGroup_Port[arrayToken[index+1]] || g_ObjectGroup_IcmpType[arrayToken[index+1]]) {
            strDstPort = arrayToken[index+1]; // object-group name.
            index += 2;
        } else {
            strDstPort = '?' + strProtocol;
        }
        strIcmpTypeCode = strDstPort;
    } else {
        strDstPort = strProtocol;
        strIcmpTypeCode = strProtocol;
    }

    // Get the ACL state.
    const strActive = isAceInactive(arrayToken, index) ? 'inactive' : 'active';

    // Return the normalized string.
    return (strAclName + ',' + intAclLine + ',' + strAclType + ',' + strPermit + ',' + strProtocol + ',' + strSrcIP + ',' + strSrcPort + ',' + strDstIP + ',' + strDstPort + ',' + strIcmpTypeCode + ',' + strActive);
}

/**
* This function normalizes ACL in configuration text. Normalized ACL strings
* are saved into arrayNormalizedAcl.
* See the 'ACL Normalization' comment above for detail.
*
* @param {string} configToFlat
* @param {Array} arrayNormalizedAcl
*
*/
function normalizeAcl(configToFlat, arrayNormalizedAcl) {
    arrayNormalizedAcl.length = 0;

    const arrayText = configToFlat.split(/\r\n|\r|\n/);

    let indexAcl = 0;
    let strAclName = '';
    let intAclLine = 0;

    for (let i=0; i<arrayText.length; ++i) {
        let strLine = arrayText[i];

        // Skip if white line.
        if (strLine.length == 0) {
            continue;
        }

        // Skip if comment line.
        if (strLine.substring(0, 1) === '!') {
            continue;
        }

        // Skip if not access-list line.
        if (strLine.substring(0, 11) !== 'access-list') {
            continue;
        }

        // Trim a line feed at the tail and trim white spaces at both head and tail.
        strLine = strLine.trim();

        // Split by whitespaces.
        const arrayToken = strLine.split(/\s+/);

        //
        if (strAclName !== arrayToken[ACLCOL_ACL_NAME]) {
            strAclName = arrayToken[ACLCOL_ACL_NAME];
            intAclLine = 1;
        } else {
            ++intAclLine;
        }

        //
        switch (arrayToken[ACLCOL_ACL_TYPE]) {
        case 'standard':
            arrayNormalizedAcl[indexAcl++] = normalizeStandardAce(arrayToken, intAclLine);
            break;
        case 'extended':
            arrayNormalizedAcl[indexAcl++] = normalizeExtendedAce(arrayToken, intAclLine);
            break;
        case 'remark':
            // Skip remark line.
            break;
        default:
            // Not supported EtherType, webtype, and others.
            console.warn(`Unsupported access-list type. ${arrayToken}`);
            break;
        }
    }
}

/*
* ============================================================================
* ACL flattener
* ============================================================================
*/

/**
* This function retrieves the array of protocol number string from
* g_ObjectGroup_Protocol and returns its array. The specified token
* indicates g_ObjectGroup_Protocol's key.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Array} The array of protocol number string.
*
* @example
*   arrayToken   index g_ObjectGroup_Protocol['Name1']    Return
*   -----------------------------------------------------------------
*   ['Name1']    0     ['ip']                          -> ['ip']
*   ['Name1']    0     ['ip','1']                      -> ['ip','1']
*   ['UNKNOWN']  0     -                               -> ['UNKNOWN']
*   ['Name1']    1     ['ip']                          -> []
*/
function getProtocolArray(arrayToken, index) {
    let array = [];
    if (arrayToken[index]) {
        const strProtocolOrObjectGroupName = arrayToken[index];
        if (g_ObjectGroup_Protocol[strProtocolOrObjectGroupName]) {
            array = g_ObjectGroup_Protocol[strProtocolOrObjectGroupName].slice();
        } else {
            array = [strProtocolOrObjectGroupName];
        }
    }
    return array;
}

/**
* This function retrieves the array of network address string from
* g_Object_Network and g_ObjectGroup_Network and returns its array.
* The specified token indicates the key of g_Object_Network or
* g_ObjectGroup_Network.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Array} The array of network address string.
*
* @example
*   arrayToken   index g_Object_Network['Name1'] g_ObjectGroup_Network['Name1']                                       Return
*   -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['Name1']    0     '192.168.0.1/24'          Not exist                                                         -> ['192.168.0.1/24']
*   ['Name1']    0     Not exist                 ['2001:0db8:0001:0002:0003:0004:0005:0006/128']                   -> ['2001:0db8:0001:0002:0003:0004:0005:0006/128']
*   ['Name1']    0     Not exist                 ['2001:0db8:0001:0002:0003:0004:0005:0006/128','www.example.com'] -> ['2001:0db8:0001:0002:0003:0004:0005:0006/128','www.example.com']
*   ['Name1']    0     '192.168.0.1/24'          ['www.example.com']                                               -> ['192.168.0.1/24']
*   ['UNKNOWN']  0     -                         -                                                                 -> ['UNKNOWN']
*   ['Name1']    1     '192.168.0.1/24'          ['www.example.com']                                               -> []
*/
function getNetworkArray(arrayToken, index) {
    let array = [];
    if (arrayToken[index]) {
        const strAddressOrObjectNameOrObjectGroupName = arrayToken[index];
        if (g_Object_Network[strAddressOrObjectNameOrObjectGroupName]) {
            array = [g_Object_Network[strAddressOrObjectNameOrObjectGroupName]];
        } else if (g_ObjectGroup_Network[strAddressOrObjectNameOrObjectGroupName]) {
            array = g_ObjectGroup_Network[strAddressOrObjectNameOrObjectGroupName].slice();
        } else {
            array = [strAddressOrObjectNameOrObjectGroupName];
        }
    }
    return array;
}

/**
* This function retrieves the array of service string from
* g_Object_Service and g_ObjectGroup_Service and returns its array.
* The specified token indicates the key of g_Object_Service or
* g_ObjectGroup_Service.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Array} The array of service string.
*
* @example
*   arrayToken   index g_Object_Service['Name1'] g_ObjectGroup_Service['Name1']                       Return
*   ---------------------------------------------------------------------------------------------------------------------------------------------------
*   ['Name1']    0     '6/eq/any/eq/any'         Not exist                                         -> ['6/eq/any/eq/any']
*   ['Name1']    0     Not exist                 ['6/range/20001-20199/eq/any']                    -> ['6/range/20001-20199/eq/any']
*   ['Name1']    0     Not exist                 ['6/range/20001-20199/eq/any','17/gt/514/eq/any'] -> ['6/range/20001-20199/eq/any','17/gt/514/eq/any']
*   ['Name1']    0     '6/eq/any/eq/any'         ['6/range/20001-20199/eq/any']                    -> ['6/eq/any/eq/any']
*   ['UNKNOWN']  0     -                         -                                                 -> ['UNKNOWN']
*   ['Name1']    1     '6/eq/any/eq/any'         ['6/range/20001-20199/eq/any']                    -> []
*/
function getServiceArray(arrayToken, index) {
    let array = [];
    if (arrayToken[index]) {
        const strServiceOrObjectNameOrObjectGroupName = arrayToken[index];
        if (g_Object_Service[strServiceOrObjectNameOrObjectGroupName]) {
            array = [g_Object_Service[strServiceOrObjectNameOrObjectGroupName]];
        } else if (g_ObjectGroup_Service[strServiceOrObjectNameOrObjectGroupName]) {
            array = g_ObjectGroup_Service[strServiceOrObjectNameOrObjectGroupName].slice();
        } else {
            array = [strServiceOrObjectNameOrObjectGroupName];
        }
    }
    return array;
}

/**
* This function retrieves the array of port condition string from
* g_ObjectGroup_Port and returns its array. The specified token indicates
* g_ObjectGroup_Port's key.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Array} The array of port condition string.
*
* @example
*   arrayToken   index g_ObjectGroup_Port['Name1']    Return
*   ------------------------------------------------------------------------
*   ['Name1']    0     ['eq/0']                    -> ['eq/0']
*   ['Name1']    0     ['eq/0','range/80-81']      -> ['eq/0','range/80-81']
*   ['UNKNOWN']  0     -                           -> ['UNKNOWN']
*   ['Name1']    1     ['eq/0']                    -> []
*/
function getPortArray(arrayToken, index) {
    let array = [];
    if (arrayToken[index]) {
        const strPortConditionOrObjectGroupName = arrayToken[index];
        if (g_ObjectGroup_Port[strPortConditionOrObjectGroupName]) {
            array = g_ObjectGroup_Port[strPortConditionOrObjectGroupName].slice();
        } else {
            array = [strPortConditionOrObjectGroupName];
        }
    }
    return array;
}

/**
* This function retrieves the array of icmp-type number string from
* g_ObjectGroup_IcmpType and returns its array. The specified token
* indicates g_ObjectGroup_IcmpType's key.
*
* @param {Array} arrayToken
* @param {number} index
* @return {Array} The array of icmp-type number string.
*
* @example
*   arrayToken   index g_ObjectGroup_IcmpType['Name1']    Return
*   -----------------------------------------------------------------
*   ['Name1']    0     ['0']                           -> ['0']
*   ['Name1']    0     ['0','1']                       -> ['0','1']
*   ['UNKNOWN']  0     -                               -> ['UNKNOWN']
*   ['Name1']    1     ['0']                           -> []
*/
function getIcmpTypeArray(arrayToken, index) {
    let array = [];
    if (arrayToken[index]) {
        const strIcmpTypeOrObjectGroupName = arrayToken[index];
        if (g_ObjectGroup_IcmpType[strIcmpTypeOrObjectGroupName]) {
            array = g_ObjectGroup_IcmpType[strIcmpTypeOrObjectGroupName].slice();
        } else {
            array = [strIcmpTypeOrObjectGroupName];
        }
    }
    return array;
}

/**
* @param {string} strProtocol
* @return {string} The protocol name for ACL element.
*/
function toProtocolOfAclElement(strProtocol) {
    if (strProtocol !== 'ip') {
        const strName = getProtocolNameFromProtocolNumberString(strProtocol);
        if (strName == undefined) {
            if (g_Object_Service[strProtocol]) {
                strProtocol = 'object ' + strProtocol;
            } else if (g_ObjectGroup_Protocol[strProtocol] || g_ObjectGroup_Service[strProtocol]) {
                strProtocol = 'object-group ' + strProtocol;
            }
        } else {
            strProtocol = strName;
        }
    }
    return strProtocol;
}

/**
* @param {string} strAddr
* @return {string} The address string for ACL element.
*/
function toAddrOfAclElement(strAddr) {
    if (strAddr === '0/0') {
        strAddr = 'any';
    } else if (strAddr === '0.0.0.0/0') {
        strAddr = 'any4';
    } else if (strAddr === '0000:0000:0000:0000:0000:0000:0000:0000/0') {
        strAddr = 'any6';
    } else if (strAddr.indexOf('-') != -1) { // Range.
        const array = strAddr.split('-');
        const strStartAddr = array[0].indexOf(':') == -1 ? array[0] : getIPv6CompressedAddr(array[0]);
        const strEndAddr   = array[1].indexOf(':') == -1 ? array[1] : getIPv6CompressedAddr(array[1]);
        strAddr = 'range ' + strStartAddr + ' ' + strEndAddr;
    } else if (strAddr.match(/^\d+\.\d+\.\d+\.\d+\/\d+$/)) { // IPv4.
        const array = strAddr.split('/');
        strAddr = array[1] === '32' ? 'host ' + array[0] : array[0] + ' ' + getIPv4NetMaskFromPrefixLength(parseInt(array[1]));
    } else if (strAddr.indexOf(':') != -1) { // IPv6.
        const array = strAddr.split('/');
        const strCompressedIPv6 = getIPv6CompressedAddr(array[0]);
        strAddr = array[1] === '128' ? 'host ' + strCompressedIPv6 : strCompressedIPv6 + '/' + array[1];
    } else {
        if (g_Object_Network[strAddr]) {
            strAddr = 'object ' + strAddr;
        } else if (g_ObjectGroup_Network[strAddr]) {
            strAddr = 'object-group ' + strAddr;
        } else { // FQDN.
            strAddr = 'fqdn ' + strAddr;
        }
    }
    return strAddr;
}

/**
* @param {string} strPort
* @param {number} intPortType
* @return {string} The port condition string for ACL element.
*/
function toPortOfAclElement(strPort, intPortType) {
    if (strPort === '-/-' || strPort === 'eq/any' || // Port was not specified.
        strPort.substring(0, 1) === '?') { // Service object or object-group.
        strPort = '';
    } else {
        const array = strPort.split('/');
        if (array[0] === 'range') {
            const arrayRange = array[1].split('-');
            const strStartName = intPortType == PORT_TYPE_TCP ? getTcpPortNameFromTcpPortNumberString(arrayRange[0]) : getUdpPortNameFromUdpPortNumberString(arrayRange[0]);
            const strEndName   = intPortType == PORT_TYPE_TCP ? getTcpPortNameFromTcpPortNumberString(arrayRange[1]) : getUdpPortNameFromUdpPortNumberString(arrayRange[1]);
            strPort = array[0] + ' ' + (strStartName == undefined ? arrayRange[0] : strStartName) + ' ' + (strEndName == undefined ? arrayRange[1] : strEndName);
        } else {
            if (array[1]) {
                const strName = intPortType == PORT_TYPE_TCP ? getTcpPortNameFromTcpPortNumberString(array[1]) : getUdpPortNameFromUdpPortNumberString(array[1]);
                strPort = array[0] + ' ' + (strName == undefined ? array[1] : strName);
            } else if (g_ObjectGroup_Port[array[0]]) {
                strPort = 'object-group ' + array[0];
            } else {
                strPort = array[0];
            }
        }
    }
    return strPort;
}

/**
* @param {string} strIcmpTypeCode
* @param {boolean} boolIcmp6
* @return {string} The icmp-type and icmp-code string for ACL element.
*/
function toIcmpTypeCodeOfAclElement(strIcmpTypeCode, boolIcmp6) {
    if (strIcmpTypeCode === '-/-' || strIcmpTypeCode === 'any/any' || // icmp-type was not specified.
        strIcmpTypeCode.substring(0, 1) === '?') { // Service object or object-group.
        strIcmpTypeCode = '';
    } else {
        const array = strIcmpTypeCode.split('/');
        const strName = boolIcmp6 ? getIcmp6TypeNameFromIcmp6TypeNumberString(array[0]) : getIcmpTypeNameFromIcmpTypeNumberString(array[0]);
        if (strName == undefined) {
            strIcmpTypeCode = g_ObjectGroup_IcmpType[array[0]] ? 'object-group ' + array[0] : array[0];
        } else {
            strIcmpTypeCode = strName;
        }
        if (array[1] && array[1] !== 'any') {
            strIcmpTypeCode += ' ' + array[1];
        }
    }
    return strIcmpTypeCode;
}

/**
* @param {string} strNormalizedAcl
* @return {string} ACL element.
*/
function toAclElement(strNormalizedAcl) {
    const arrayToken = strNormalizedAcl.split(',');

    let strAclElement = 'access-list ' + arrayToken[NMCOL_ACL_NAME] + ' line ' + arrayToken[NMCOL_ACL_LINE] + ' ' + arrayToken[NMCOL_ACL_TYPE] + ' ' + arrayToken[NMCOL_PERMIT];

    if (arrayToken[NMCOL_ACL_TYPE] === 'standard') {
        strAclElement += ' ' + toAddrOfAclElement(arrayToken[NMCOL_DST_ADDR]);
    } else {
        const intPortType = arrayToken[NMCOL_PROTOCOL] === '6' ? PORT_TYPE_TCP : PORT_TYPE_UDP;
        strAclElement += ' ' + toProtocolOfAclElement(arrayToken[NMCOL_PROTOCOL]);
        strAclElement += ' ' + toAddrOfAclElement(arrayToken[NMCOL_SRC_ADDR]);
        strAclElement += ' ' + toPortOfAclElement(arrayToken[NMCOL_SRC_PORT], intPortType);
        strAclElement += ' ' + toAddrOfAclElement(arrayToken[NMCOL_DST_ADDR]);
        strAclElement += ' ' + toPortOfAclElement(arrayToken[NMCOL_DST_PORT], intPortType);
        strAclElement += ' ' + toIcmpTypeCodeOfAclElement(arrayToken[NMCOL_ICMPTYCD], arrayToken[NMCOL_PROTOCOL] === '58');
    }

    // active or inactive.
    if (arrayToken[NMCOL_ACTIVE] === 'inactive') {
        strAclElement += ' ' + arrayToken[NMCOL_ACTIVE];
    }

    //
    return strAclElement.replace(/\s+/g, ' ').trim();
}

/**
* This function flattens the protocol object-group of the normalized ACE and
* returns the ACL flattened.
*
* @param {Array} arrayToken
* @return {Array} ACL which has been flattened the protocol object-group.
*
* @example
*   Variables state when calls.
*   --------------------------------------------
*   g_ObjectGroup_Protocol{'Name1'} = ['ip']
*   g_ObjectGroup_Protocol{'Name2'} = ['ip','1']
*
*   arrayToken                                                                                                 Return
*   ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['ACL1','1','extended','permit','Name1','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active']   -> ['ACL1,1,extended,permit,ip,192.168.0.1/32,-/-,192.168.1.1/32,-/-,-/-,active']
*   ['ACL1','1','extended','permit','Name2','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active']   -> ['ACL1,1,extended,permit,ip,192.168.0.1/32,-/-,192.168.1.1/32,-/-,-/-,active',
*                                                                                                               'ACL1,1,extended,permit,1,192.168.0.1/32,-/-,192.168.1.1/32,-/-,-/-,active']
*   ['ACL1','1','extended','permit','UNKNOWN','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active'] -> ['ACL1,1,extended,permit,UNKNOWN,192.168.0.1/32,-/-,192.168.1.1/32,-/-,-/-,active']
*/
const funcFlattenProtocolObjectGroupOfNormalizedAce = function(arrayToken) {
    const arrayFlatString = [];
    const arrayProtocol = getProtocolArray(arrayToken, NMCOL_PROTOCOL);
    if (arrayProtocol[0]) {
        let index = 0;
        for (let i=0; i<arrayProtocol.length; ++i) {
            arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
            arrayFlatString[index] += ',' + arrayProtocol[i];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_PORT];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_PORT];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ICMPTYCD];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
            ++index;
        }
    }
    return arrayFlatString;
};

/**
* This function flattens the network object and the network object-group of
* the normalized ACE and returns the ACL flattened.
*
* @param {Array} arrayToken
* @return {Array}
*   ACL which has been flattened both the network object and the network
*   object-group.
*
* @example
*   Variables state when calls.
*   ---------------------------------------------------------------------------------------------------
*   g_Object_Network{'Name11'} = '192.168.0.0/24'
*   g_ObjectGroup_Network{'Name22'} = ['192.168.2.0/24','www1.example.com']
*   g_ObjectGroup_Network{'Name23'} = ['2001:0db8:0001:0002:0000:0000:0000:0000/64']
*   g_ObjectGroup_Network{'Name24'} = ['2001:0db8:0001:0002:0000:0000:0000:0000/64','www2.example.com']
*
*   arrayToken                                                                                   Return
*   --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['ACL1','1','extended','permit','0','Name11','-/-','192.168.1.1/32','-/-','-/-','active'] -> ['ACL1,1,extended,permit,0,192.168.0.0/24,-/-,192.168.1.1/32,-/-,-/-,active']
*   ['ACL1','1','extended','permit','0','192.168.0.1/32','-/-','Name23','-/-','-/-','active'] -> ['ACL1,1,extended,permit,0,192.168.0.1/32,-/-,2001:0db8:0001:0002:0000:0000:0000:0000/64,-/-,-/-,active']
*   ['ACL1','1','extended','permit','0','192.168.0.1/32','-/-','Name24','-/-','-/-','active'] -> ['ACL1,1,extended,permit,0,192.168.0.1/32,-/-,2001:0db8:0001:0002:0000:0000:0000:0000/64,-/-,-/-,active',
*                                                                                                 'ACL1,1,extended,permit,0,192.168.0.1/32,-/-,www2.example.com,-/-,-/-,active']
*   ['ACL1','1','extended','permit','0','Name22','-/-','Name24','-/-','-/-','active']         -> ['ACL1,1,extended,permit,0,192.168.2.0/24,-/-,2001:0db8:0001:0002:0000:0000:0000:0000/64,-/-,-/-,active',
*                                                                                                 'ACL1,1,extended,permit,0,192.168.2.0/24,-/-,www2.example.com,-/-,-/-,active',
*                                                                                                 'ACL1,1,extended,permit,0,www1.example.com,-/-,2001:0db8:0001:0002:0000:0000:0000:0000/64,-/-,-/-,active',
*                                                                                                 'ACL1,1,extended,permit,0,www1.example.com,-/-,www2.example.com,-/-,-/-,active']
*   ['ACL1','1','extended','permit','0','UNKNOWN','-/-','Name24','-/-','-/-','active']        -> ['ACL1,1,extended,permit,0,UNKNOWN,-/-,2001:0db8:0001:0002:0000:0000:0000:0000/64,-/-,-/-,active',
*                                                                                                 'ACL1,1,extended,permit,0,UNKNOWN,-/-,www2.example.com,-/-,-/-,active']
*/
const funcFlattenNetworkObjectAndObjectGroupOfNormalizedAce = function(arrayToken) {
    const arrayFlatString = [];
    const arraySrcIP = getNetworkArray(arrayToken, NMCOL_SRC_ADDR);
    const arrayDstIP = getNetworkArray(arrayToken, NMCOL_DST_ADDR);
    if (arraySrcIP[0] && arrayDstIP[0]) {
        let index = 0;
        for (let i=0; i<arraySrcIP.length; ++i) {
            for (let j=0; j<arrayDstIP.length; ++j) {
                arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PROTOCOL];
                arrayFlatString[index] += ',' + arraySrcIP[i];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_PORT];
                arrayFlatString[index] += ',' + arrayDstIP[j];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_PORT];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ICMPTYCD];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
                ++index;
            }
        }
    }
    return arrayFlatString;
};

/**
* This function flattens the service object and the service object-group of
* the normalized ACE and returns the ACL flattened.
*
* @param {Array} arrayToken
* @return {Array}
*   ACL which has been flattened both the service object and the service
*   object-group.
*
* @example
*   Variables state when calls.
*   -------------------------------------------------------------------------------------
*   g_Object_Service{'Name11'} = '192.168.0.0/24'
*   g_ObjectGroup_Service{'Name21'} = ['6/range/20001-20199/eq/any']
*   g_ObjectGroup_Service{'Name22'} = ['6/range/20001-20199/lt/20000','17/gt/514/eq/any']
*
*   arrayToken                                                                                                 Return
*   -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['ACL1','1','extended','permit','Name11','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active']  -> ['ACL1,1,extended,permit,6,192.168.0.1/32,eq/any,192.168.1.1/32,neq/22,-/-,active']
*   ['ACL1','1','extended','permit','Name21','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active']  -> ['ACL1,1,extended,permit,6,192.168.0.1/32,range/20001-20199,192.168.1.1/32,eq/any,-/-,active']
*   ['ACL1','1','extended','permit','Name22','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active']  -> ['ACL1,1,extended,permit,6,192.168.0.1/32,range/20001-20199,192.168.1.1/32,lt/20000,-/-,active',
*                                                                                                               'ACL1,1,extended,permit,17,192.168.0.1/32,gt/514,192.168.1.1/32,eq/any,-/-,active']
*   ['ACL1','1','extended','permit','UNKNOWN','192.168.0.1/32','-/-','192.168.1.1/32','-/-','-/-','active'] -> ['ACL1,1,extended,permit,UNKNOWN,192.168.0.1/32,-/-,192.168.1.1/32,-/-,-/-,active']
*/
const funcFlattenServiceObjectAndServiceObjectGroupOfNormalizedAce = function(arrayToken) {
    const arrayFlatString = [];
    const arrayService = getServiceArray(arrayToken, NMCOL_PROTOCOL);
    if (arrayService[0]) {
        const strScrPort = (arrayToken[NMCOL_PROTOCOL] === arrayService[0]) ? arrayToken[NMCOL_SRC_PORT] : '-/-';
        const strDstPort = (arrayToken[NMCOL_PROTOCOL] === arrayService[0]) ? arrayToken[NMCOL_DST_PORT] : '-/-';
        const strIcmpTypeCode = (arrayToken[NMCOL_PROTOCOL] === arrayService[0]) ? arrayToken[NMCOL_ICMPTYCD] : '-/-';
        let index = 0;
        for (let i=0; i<arrayService.length; ++i) {
            const array = arrayService[i].split('/');
            if (array.length > 4) { // tcp or udp.
                arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
                arrayFlatString[index] += ',' + array[0];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
                arrayFlatString[index] += ',' + array[1] + '/' + array[2];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
                arrayFlatString[index] += ',' + array[3] + '/' + array[4];
                arrayFlatString[index] += ',' + strIcmpTypeCode;
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
            } else if (array.length > 1) { // icmp or icmp6
                arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
                arrayFlatString[index] += ',' + array[0];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
                arrayFlatString[index] += ',' + strScrPort;
                arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
                arrayFlatString[index] += ',' + strDstPort;
                arrayFlatString[index] += ',' + array[1] + '/' + array[2];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
            } else { // ip or protocol number.
                arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
                arrayFlatString[index] += ',' + array[0];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
                arrayFlatString[index] += ',' + strScrPort;
                arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
                arrayFlatString[index] += ',' + strDstPort;
                arrayFlatString[index] += ',' + strIcmpTypeCode;
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
            }
            ++index;
        }
    }
    return arrayFlatString;
};

/**
* This function flattens the port object-group of the normalized ACE and
* returns the ACL flattened.
*
* @param {Array} arrayToken
* @return {Array} ACL which has been flattened the port object-group.
*
* @example
*   Variables state when calls.
*   -----------------------------------------------------
*   g_ObjectGroup_Port{'Name11'} = ['eq/0']
*   g_ObjectGroup_Port{'Name12'} = ['eq/0','range/80-81']
*   g_ObjectGroup_Port{'Name21'} = ['lt/80']
*   g_ObjectGroup_Port{'Name22'} = ['lt/80','gt/10000']
*
*   arrayToken                                                                                                  Return
*   ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['ACL1','1','extended','permit','6','192.168.0.1/32','Name11','192.168.1.1/32','-/-','-/-','active']     -> ['ACL1,1,extended,permit,6,192.168.0.1/32,eq/0,192.168.1.1/32,-/-,-/-,active']
*   ['ACL1','1','extended','permit','6','192.168.0.1/32','-/-','192.168.1.1/32','Name21','-/-','active']     -> ['ACL1,1,extended,permit,6,192.168.0.1/32,-/-,192.168.1.1/32,lt/80,-/-,active']
*   ['ACL1','1','extended','permit','6','192.168.0.1/32','Name12','192.168.1.1/32','Name22','-/-','active']  -> ['ACL1,1,extended,permit,6,192.168.0.1/32,eq/0,192.168.1.1/32,lt/80,-/-,active',
*                                                                                                                'ACL1,1,extended,permit,6,192.168.0.1/32,eq/0,192.168.1.1/32,gt/10000,-/-,active',
*                                                                                                                'ACL1,1,extended,permit,6,192.168.0.1/32,range/80-81,192.168.1.1/32,lt/80,-/-,active',
*                                                                                                                'ACL1,1,extended,permit,6,192.168.0.1/32,range/80-81,192.168.1.1/32,gt/10000,-/-,active']
*   ['ACL1','1','extended','permit','6','192.168.0.1/32','UNKNOWN','192.168.1.1/32','Name22','-/-','active'] -> ['ACL1,1,extended,permit,6,192.168.0.1/32,UNKNOWN,192.168.1.1/32,lt/80,-/-,active',
*                                                                                                                'ACL1,1,extended,permit,6,192.168.0.1/32,UNKNOWN,192.168.1.1/32,gt/10000,-/-,active']
*/
const funcFlattenPortObjectGroupOfNormalizedAce = function(arrayToken) {
    const arrayFlatString = [];
    const arraySrcPort = getPortArray(arrayToken, NMCOL_SRC_PORT);
    const arrayDstPort = getPortArray(arrayToken, NMCOL_DST_PORT);
    if (arraySrcPort[0] && arrayDstPort[0]) {
        let index = 0;
        for (let i=0; i<arraySrcPort.length; ++i) {
            for (let j=0; j<arrayDstPort.length; ++j) {
                arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_PROTOCOL];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
                arrayFlatString[index] += ',' + arraySrcPort[i];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
                arrayFlatString[index] += ',' + arrayDstPort[j];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ICMPTYCD];
                arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
                ++index;
            }
        }
    }
    return arrayFlatString;
};

/**
* This function flattens the icmp-type object-group of the normalized ACE and
* returns the ACL flattened.
*
* @param {Array} arrayToken
* @return {Array} ACL which has been flattened the icmp-type object-group.
*
* @example
*   Variables state when calls.
*   -------------------------------------------
*   g_ObjectGroup_IcmpType{'Name1'} = ['0']
*   g_ObjectGroup_IcmpType{'Name2'} = ['0','1']
*
*   arrayToken                                                                                               Return
*   ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
*   ['ACL1','1','extended','permit','1','192.168.0.1/32','-/-','192.168.1.1/32','-/-','Name1','active']   -> ['ACL1,1,extended,permit,1,192.168.0.1/32,-/-,192.168.1.1/32,-/-,0/any,active']
*   ['ACL1','1','extended','permit','1','192.168.0.1/32','-/-','192.168.1.1/32','-/-','Name2','active']   -> ['ACL1,1,extended,permit,1,192.168.0.1/32,-/-,192.168.1.1/32,-/-,0/any,active',
*                                                                                                             'ACL1,1,extended,permit,1,192.168.0.1/32,-/-,192.168.1.1/32,-/-,1/any,active'],
*   ['ACL1','1','extended','permit','1','192.168.0.1/32','-/-','192.168.1.1/32','-/-','UNKNOWN','active'] -> ['ACL1,1,extended,permit,1,192.168.0.1/32,-/-,192.168.1.1/32,-/-,UNKNOWN/any,active']
*/
const funcFlattenIcmpTypeObjectGroupOfNormalizedAce = function(arrayToken) {
    const arrayFlatString = [];
    const arrayIcmpType = getIcmpTypeArray(arrayToken, NMCOL_ICMPTYCD);
    if (arrayIcmpType[0]) {
        let index = 0;
        for (let i=0; i<arrayIcmpType.length; ++i) {
            arrayFlatString[index] = arrayToken[NMCOL_ACL_NAME];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_LINE];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACL_TYPE];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_PERMIT];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_PROTOCOL];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_ADDR];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_SRC_PORT];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_ADDR];
            arrayFlatString[index] += ',' + arrayToken[NMCOL_DST_PORT];
            arrayFlatString[index] += ',' + (arrayIcmpType[i].indexOf('/') == -1 ? arrayIcmpType[i] + '/any' : arrayIcmpType[i]);
            arrayFlatString[index] += ',' + arrayToken[NMCOL_ACTIVE];
            ++index;
        }
    }
    return arrayFlatString;
};

/**
* This function flattens objects and object-groups of the normalized ACL using
* the specified function literal and returns the ACL flattened.
*
* @param {Array} arrayNormalizedAcl
* @param {function} funcFlattenObjectAndObjectGroupOfNormalizedAce
* @return {Array} The flattened ACL.
*
*/
function flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenObjectAndObjectGroupOfNormalizedAce) {
    let index = 0;
    const arrayFlattenedString = [];
    for (let i=0; i<arrayNormalizedAcl.length; ++i) {
        // Split by a comma.
        const arrayToken = arrayNormalizedAcl[i].split(',');

        // Flatten objects and object-groups.
        const array = funcFlattenObjectAndObjectGroupOfNormalizedAce(arrayToken);
        for (let j=0; j<array.length; ++j) {
            arrayFlattenedString[index++] = array[j];
        }
    }
    return arrayFlattenedString;
}

/**
* This function flattens the normalized ACL and saves the flattened ACL into
* the specified array. The result of flat all objects and object-groups saves
* into arrayFlattenedAcl. The result of flattened only network objects and
* network object-groups saves into arrayFlattenedAclOfNetwork.
*
* @param {Array} arrayNormalizedAclToFlatten
* @param {boolean} boolNetwork
* @param {boolean} boolProtocol
* @param {boolean} boolService
* @param {boolean} boolPort
* @param {boolean} boolIcmpType
* @param {boolean} boolAclElement
* @param {Array} arrayFlattenedAclOfNetwork
* @param {Array} arrayFlattenedAcl
*
*/
function flattenNormalizedAcl(arrayNormalizedAclToFlatten, boolNetwork, boolProtocol, boolService, boolPort, boolIcmpType, boolAclElement, arrayFlattenedAclOfNetwork, arrayFlattenedAcl) {
    arrayFlattenedAclOfNetwork.length = 0;
    arrayFlattenedAcl.length = 0;

    for (let i=0; i<arrayNormalizedAclToFlatten.length; ++i) {
        let arrayNormalizedAcl = [];
        arrayNormalizedAcl[0] = arrayNormalizedAclToFlatten[i];

        if (boolNetwork) {
            arrayNormalizedAcl = flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenNetworkObjectAndObjectGroupOfNormalizedAce);

            // Save the result that network objects and object-groups were flattened.
            for (let j=0; j<arrayNormalizedAcl.length; ++j) {
                let strFlattened = arrayNormalizedAcl[j];
                if (boolAclElement) {
                    strFlattened += ',' + toAclElement(arrayNormalizedAcl[j]);
                }
                arrayFlattenedAclOfNetwork.push(strFlattened);
            }
        }
        if (boolProtocol) {
            arrayNormalizedAcl = flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenProtocolObjectGroupOfNormalizedAce);
        }
        if (boolService) {
            arrayNormalizedAcl = flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenServiceObjectAndServiceObjectGroupOfNormalizedAce);
        }
        if (boolPort) {
            arrayNormalizedAcl = flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenPortObjectGroupOfNormalizedAce);
        }
        if (boolIcmpType) {
            arrayNormalizedAcl = flattenObjectAndObjectGroupOfNormalizedAce(arrayNormalizedAcl, funcFlattenIcmpTypeObjectGroupOfNormalizedAce);
        }

        // Save the result that all objects and object-groups were flattened.
        for (let j=0; j<arrayNormalizedAcl.length; ++j) {
            let strFlattened = arrayNormalizedAcl[j];
            if (boolAclElement) {
                strFlattened += ',' + toAclElement(arrayNormalizedAcl[j]);
            }
            arrayFlattenedAcl.push(strFlattened);
        }
    }
}

/*
* ============================================================================
* Address lookup
* ============================================================================
*/

/**
* This function returns true if the lookup address is within the address to be
* looked up. Otherwise, it is false. If the lookup address is a host address,
* confirm whether its address is within the address to be looked up. If the
* lookup address is a network segment, confirms whether all addresses of the
* network segment are within the address to be looked up. Its address has to
* be the full represented if IPv6 address.
*
* @param {string} strAddrWithPrefixLengthToBeLookedUp
* @param {string} strLookupAddr
* @param {number} intLookupAddrType
* @return {boolean}
*   true if the lookup address is within the address to be looked up.
*   Otherwise, it is false.
*
*/
function isWithin(strAddrWithPrefixLengthToBeLookedUp, strLookupAddr, intLookupAddrType) {
    if (strAddrWithPrefixLengthToBeLookedUp === '0/0') { // any.
        return true;
    }
    if (intLookupAddrType == LOOKUP_ADDRESS_TYPE_FQDN) { // Address is FQDN.
        if (strLookupAddr === strAddrWithPrefixLengthToBeLookedUp) { // FQDN is identical.
            return true;
        }
        const array = strAddrWithPrefixLengthToBeLookedUp.split('/');
        if (array[1] && array[1] === '0') { // Prefix length is 0.
            return true;
        }
    }
    if (intLookupAddrType == LOOKUP_ADDRESS_TYPE_IPV4 && strAddrWithPrefixLengthToBeLookedUp.indexOf(':') == -1) { // IPv4.
        if (strAddrWithPrefixLengthToBeLookedUp.indexOf('-') != -1) { // The format of the address which is looked up is range format.
            if (isIPv4WithPrefixLengthIncludedInRange(strLookupAddr, strAddrWithPrefixLengthToBeLookedUp)) { // IPv4 address is within range.
                return true;
            }
        } else if (strAddrWithPrefixLengthToBeLookedUp.indexOf('/') != -1) { // The format of the address which is looked up is CIDR format.
            if (isIPv4WithPrefixLengthIncludedInSegment(strLookupAddr, strAddrWithPrefixLengthToBeLookedUp)) { // IPv4 address is within the segment.
                return true;
            }
        } else { // The format of the address which is looked up is FQDN.
            // Nothing to do.
        }
    }
    if (intLookupAddrType == LOOKUP_ADDRESS_TYPE_IPV6 && strAddrWithPrefixLengthToBeLookedUp.indexOf(':') != -1) { // IPv6.
        if (strAddrWithPrefixLengthToBeLookedUp.indexOf('-') != -1) { // The format of the address which is looked up is range format.
            if (isIPv6WithPrefixLengthIncludedInRange(strLookupAddr, strAddrWithPrefixLengthToBeLookedUp)) { // IPv6 address is within range.
                return true;
            }
        } else if (strAddrWithPrefixLengthToBeLookedUp.indexOf('/') != -1) { // The format of the address which is looked up is CIDR format.
            if (isIPv6WithPrefixLengthIncludedInSegment(strLookupAddr, strAddrWithPrefixLengthToBeLookedUp)) { // IPv6 address is within the segment.
                return true;
            }
        } else { // The format of the address which is looked up is FQDN.
            // Nothing to do.
        }
    }
    return false;
}

/**
* This function looks up the specified source address and destination address
* in the normalized ACL and saves the matched entries into the specified array.
* All matched entries are saved into arrayResult, and the matched entries
* except ineffectual ACE are saved into arrayResultWithoutIneffectual.
* The result string in the array is appended the prefix string as follows.
*   - 'from_192.168.0.1,' if only the source address looks up.
*   - 'to_2001:db8::1/128,' if only the destination address looks up.
*   - 'from_192.168.0.1_to_2001:db8::1/128,'
*     if both the source address and the destination address look up.
* If the lookup address string is empty, this function does not look up its
* address.
* IPv6 address can contain the compressed format.
*
* @param {Array} arrayNormalizedAclToBeLookedUp
* @param {string} strSrcAddr
* @param {number} intSrcAddrType
* @param {string} strDstAddr
* @param {number} intDstAddrType
* @param {Array} arrayResult
* @param {Array} arrayResultWithoutIneffectual
*
*/
function lookUpAddrInNormalizedAceArray(arrayNormalizedAclToBeLookedUp, strSrcAddr, intSrcAddrType, strDstAddr, intDstAddrType, arrayResult, arrayResultWithoutIneffectual) {
    let strSrcFullAddr = strSrcAddr;
    if (intSrcAddrType == LOOKUP_ADDRESS_TYPE_IPV6) {
        strSrcFullAddr = getIPv6FullRepresentedAddrWithPrefixLength(strSrcAddr);
        if (strSrcFullAddr === '') {
            return;
        }
    }
    let strDstFullAddr = strDstAddr;
    if (intDstAddrType == LOOKUP_ADDRESS_TYPE_IPV6) {
        strDstFullAddr = getIPv6FullRepresentedAddrWithPrefixLength(strDstAddr);
        if (strDstFullAddr === '') {
            return;
        }
    }

    let strSkipAcl = '';

    for (let i=0; i<arrayNormalizedAclToBeLookedUp.length; ++i) {
        const strLine = arrayNormalizedAclToBeLookedUp[i];
        const arrayToken = strLine.split(',');
        // Clear the marker because reached the next ACL name.
        if (strSkipAcl !== arrayToken[NMCOL_ACL_NAME]) {
            strSkipAcl = '';
        }

        let boolSrcMatched = false;
        let boolDstMatched = false;
        let boolBothMatched = false;
        let str1stColumn = '';
        if (intSrcAddrType != LOOKUP_ADDRESS_TYPE_UNKNOWN && intDstAddrType == LOOKUP_ADDRESS_TYPE_UNKNOWN) {
            boolSrcMatched = isWithin(arrayToken[NMCOL_SRC_ADDR], strSrcFullAddr, intSrcAddrType);
            str1stColumn = 'from_' + strSrcAddr;
        } else if (intSrcAddrType == LOOKUP_ADDRESS_TYPE_UNKNOWN && intDstAddrType != LOOKUP_ADDRESS_TYPE_UNKNOWN) {
            boolDstMatched = isWithin(arrayToken[NMCOL_DST_ADDR], strDstFullAddr, intDstAddrType);
            str1stColumn = 'to_' + strDstAddr;
        } else {
            boolBothMatched = isWithin(arrayToken[NMCOL_SRC_ADDR], strSrcFullAddr, intSrcAddrType) && isWithin(arrayToken[NMCOL_DST_ADDR], strDstFullAddr, intDstAddrType);
            str1stColumn = 'from_' + strSrcAddr + '_to_' + strDstAddr;
        }

        //
        if (boolSrcMatched || boolDstMatched || boolBothMatched) {
            const strAdd = str1stColumn + ',' + strLine;
            arrayResult.push(strAdd);

            if (arrayToken[NMCOL_PERMIT] === 'deny' && arrayToken[NMCOL_ACTIVE] === 'active') {
                if (arrayToken[NMCOL_PROTOCOL] === 'ip') {
                    if ((arrayToken[NMCOL_SRC_ADDR] === '0/0' && arrayToken[NMCOL_DST_ADDR] === '0/0') ||
                        (boolSrcMatched && arrayToken[NMCOL_DST_ADDR] === '0/0') ||
                        (boolBothMatched &&
                        (arrayToken[NMCOL_DST_ADDR] === '0/0' ||
                        (intDstAddrType == LOOKUP_ADDRESS_TYPE_IPV4 && arrayToken[NMCOL_DST_ADDR] === '0.0.0.0/0') ||
                        (intDstAddrType == LOOKUP_ADDRESS_TYPE_IPV6 && arrayToken[NMCOL_DST_ADDR] === '0000:0000:0000:0000:0000:0000:0000:0000/0')))
                        ) {
                        strSkipAcl = arrayToken[NMCOL_ACL_NAME];
                    }
                }
            }

            //
            if (arrayToken[NMCOL_ACTIVE] === 'active' && strSkipAcl === '') {
                arrayResultWithoutIneffectual.push(strAdd);
            }
        }
    }
}

/**
* This function looks up the list of lookup addresses in the normalized ACL
* and saves the matched entries into the specified array. All matched entries
* are saved into arrayResult, and the matched entries except ineffectual ACE
* are saved into arrayResultWithoutIneffectual.
* The result string in the array is appended the prefix string as follows.
*   - 'from_192.168.0.1,' if only the source address looks up.
*   - 'to_2001:db8::1/128,' if only the destination address looks up.
*   - 'from_192.168.0.1_to_2001:db8::1/128,'
*     if both the source address and the destination address look up.
* The line format of the list of lookup addresses is following. The comment
* field can omit.
*   - 'source address,destination address,comment'
*     if both the source address and the destination address look up.
*   - 'source address,,comment' if only the source address looks up.
*   - ',destination address,comment' if only the destination address looks up.
* IPv6 address can contain the compressed format.
*
* @param {Array} arrayNormalizedAclToBeLookedUp
* @param {string} listOfLookUpAddr
* @param {Array} arrayResult
* @param {Array} arrayResultWithoutIneffectual
*
*/
function lookUpAddrList(arrayNormalizedAclToBeLookedUp, listOfLookUpAddr, arrayResult, arrayResultWithoutIneffectual) {
    const arrayText = listOfLookUpAddr.split(/\r\n|\r|\n/);

    arrayResult.length = 0;
    arrayResultWithoutIneffectual.length = 0;
    for (let i=0; i<arrayText.length; ++i) {
        let strLine = arrayText[i];

        // Trim a line feed at the tail and trim white spaces at both head and tail.
        strLine = strLine.trim();

        // Skip if white line.
        if (strLine.length == 0) {
            continue;
        }

        // Skip if comment line.
        const strHeadChar = strLine.substring(0, 1);
        if (strHeadChar === '!' || strHeadChar === '#') {
            continue;
        }

        // Skip if neither IPv4, IPv6, nor FQDN.
        const arrayLookupAddr = strLine.split(',');
        const strSrcAddr = arrayLookupAddr[0].trim();
        const strDstAddr = ((arrayLookupAddr[1]) ? arrayLookupAddr[1].trim() : '');
        let intSrcAddrType = LOOKUP_ADDRESS_TYPE_UNKNOWN;
        let intDstAddrType = LOOKUP_ADDRESS_TYPE_UNKNOWN;
        if (strSrcAddr !== '') {
            if (strSrcAddr.match(/^\d+\.\d+\.\d+\.\d+\/\d+$/)) {
                intSrcAddrType = LOOKUP_ADDRESS_TYPE_IPV4;
            } else if (strSrcAddr.indexOf(':') != -1) {
                intSrcAddrType = LOOKUP_ADDRESS_TYPE_IPV6;
            } else if (strSrcAddr.match(/^([\dA-Za-z][\dA-Za-z\-]{1,61}[\dA-Za-z](?:\.|))+$/)) {
                intSrcAddrType = LOOKUP_ADDRESS_TYPE_FQDN;
            }
            if (intSrcAddrType == LOOKUP_ADDRESS_TYPE_UNKNOWN) {
                continue;
            }
        }
        if (strDstAddr !== '') {
            if (strDstAddr.match(/^\d+\.\d+\.\d+\.\d+\/\d+$/)) {
                intDstAddrType = LOOKUP_ADDRESS_TYPE_IPV4;
            } else if (strDstAddr.indexOf(':') != -1) {
                intDstAddrType = LOOKUP_ADDRESS_TYPE_IPV6;
            } else if (strDstAddr.match(/^([\dA-Za-z][\dA-Za-z\-]{1,61}[\dA-Za-z](?:\.|))+$/)) {
                intDstAddrType = LOOKUP_ADDRESS_TYPE_FQDN;
            }
            if (intDstAddrType == LOOKUP_ADDRESS_TYPE_UNKNOWN) {
                continue;
            }
        }

        //
        lookUpAddrInNormalizedAceArray(arrayNormalizedAclToBeLookedUp, strSrcAddr, intSrcAddrType, strDstAddr, intDstAddrType, arrayResult, arrayResultWithoutIneffectual);
    }
}

/*
* ============================================================================
* Async functions.
* ============================================================================
*/

/**
* @param {string} configToFlat
* @return {Object} Promise
*/
function async_makeAsaNameList(configToFlat) {
    return new Promise((resolve)=>{
        makeAsaNameList(configToFlat);
        resolve('');
    });
}

/**
* @param {string} configToFlat
* @return {Object} Promise
*/
function async_makeAsaObjectList(configToFlat) {
    return new Promise((resolve)=>{
        makeAsaObjectList(configToFlat);
        resolve('');
    });
}

/**
* @param {string} configToFlat
* @return {Object} Promise
*/
function async_makeAsaObjectGroupList(configToFlat) {
    return new Promise((resolve)=>{
        makeAsaObjectGroupList(configToFlat);
        resolve('');
    });
}

/**
* @param {string} configToFlat
* @param {Array} arrayNormalizedAcl
* @return {Object} Promise
*/
function async_normalizeAcl(configToFlat, arrayNormalizedAcl) {
    return new Promise((resolve)=>{
        normalizeAcl(configToFlat, arrayNormalizedAcl);
        resolve('');
    });
}

/**
* @param {Array} arrayNormalizedAclToFlatten
* @param {boolean} boolNetwork
* @param {boolean} boolProtocol
* @param {boolean} boolService
* @param {boolean} boolPort
* @param {boolean} boolIcmpType
* @param {boolean} boolAclElement
* @param {Array} arrayFlattenedAclOfNetwork
* @param {Array} arrayFlattenedAcl
* @return {Object} Promise
*/
function async_flattenNormalizedAcl(arrayNormalizedAclToFlatten, boolNetwork, boolProtocol, boolService, boolPort, boolIcmpType, boolAclElement, arrayFlattenedAclOfNetwork, arrayFlattenedAcl) {
    return new Promise((resolve)=>{
        flattenNormalizedAcl(arrayNormalizedAclToFlatten, boolNetwork, boolProtocol, boolService, boolPort, boolIcmpType, boolAclElement, arrayFlattenedAclOfNetwork, arrayFlattenedAcl);
        resolve('');
    });
}

/**
* @param {Array} arrayNormalizedAclToBeLookedUp
* @param {string} listOfLookUpAddr
* @param {Array} arrayResult
* @param {Array} arrayResultWithoutIneffectual
* @return {Object} Promise
*/
function async_lookUpAddrList(arrayNormalizedAclToBeLookedUp, listOfLookUpAddr, arrayResult, arrayResultWithoutIneffectual) {
    return new Promise((resolve)=>{
        lookUpAddrList(arrayNormalizedAclToBeLookedUp, listOfLookUpAddr, arrayResult, arrayResultWithoutIneffectual);
        resolve('');
    });
}

/*
* ============================================================================
* Dedicated Worker thread functions
* ============================================================================
*/

const MSG_MAKE_LIST  = 1;
const MSG_MADE_LIST  = 2;
const MSG_NORMALIZE  = 3;
const MSG_NORMALIZED = 4;
const MSG_FLATTEN    = 5;
const MSG_FLATTENED  = 6;
const MSG_LOOKUP     = 7;
const MSG_LOOKEDUP   = 8;

const g_NormalizedAcl = [];
const g_FlattenedAcl = [];

/**
* This function handles requests from the main thread and sends the responses
* to the main thread.
*
* @param {Object} e : MessageEvent object from the main thread.
*/
var onmessage = function(e) { // eslint-disable-line no-var
    if (e.data[0]) {
        switch (e.data[0]) {
        case MSG_MAKE_LIST:
            async_makeAsaNameList(e.data[1]).then(()=>{
                outputName();

                async_makeAsaObjectList(e.data[1]).then(()=>{
                    outputNetworkObject();
                    outputServiceObject();

                    async_makeAsaObjectGroupList(e.data[1]).then(()=>{
                        outputNetworkObjectGroup();
                        outputServiceObjectGroup();
                        outputProtocolObjectGroup();
                        outputPortObjectGroup();

                        postMessage([
                            MSG_MADE_LIST,
                            //getNameListAsString(),
                            getNetworkObjectListAsString(),
                            getNetworkObjectGroupListAsString(),
                        ]);
                    });
                });
            });
            break;
        case MSG_NORMALIZE:
            makeProtocolTypeBitList();

            g_NormalizedAcl.length = 0;
            async_normalizeAcl(e.data[1], g_NormalizedAcl).then(()=>{
                postMessage([
                    MSG_NORMALIZED,
                    g_NormalizedAcl.join('\r\n'),
                ]);
            });
            break;
        case MSG_FLATTEN:
            {
                const arrayFlattenedAcl_Network = [];
                g_FlattenedAcl.length = 0;
                async_flattenNormalizedAcl(
                    g_NormalizedAcl,
                    e.data[1],
                    e.data[2],
                    e.data[3],
                    e.data[4],
                    e.data[5],
                    e.data[6],
                    arrayFlattenedAcl_Network,
                    g_FlattenedAcl).then(()=>{
                    postMessage([
                        MSG_FLATTENED,
                        g_FlattenedAcl.join('\r\n'),
                        arrayFlattenedAcl_Network.join('\r\n'),
                    ]);
                });
            }
            break;
        case MSG_LOOKUP:
            {
                const arrayLookupResult = [];
                const arrayLookupResultEI = [];
                async_lookUpAddrList(g_FlattenedAcl, e.data[1], arrayLookupResult, arrayLookupResultEI).then(()=>{
                    postMessage([
                        MSG_LOOKEDUP,
                        arrayLookupResult.join('\r\n'),
                        arrayLookupResultEI.join('\r\n'),
                    ]);
                });
            }
            break;
        }
    } else {
        console.warn('WORKER: Received an invalid message.');
    }
};

/*
* ============================================================================
* ============================================================================
*/

/**
* @return {string}
*/
function getNameListAsString() {
    let strOutput = '';
    for (const key in g_Name) {
        if (g_Name.hasOwnProperty(key)) {
            strOutput += key + ',' + JSON.stringify(g_Name[key]) + '\r\n';
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getNetworkObjectListAsString() {
    let strOutput = '';
    for (const key in g_Object_Network) {
        if (g_Object_Network.hasOwnProperty(key)) {
            strOutput += key + ',' + g_Object_Network[key] + '\r\n';
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getServiceObjectListAsString() {
    let strOutput = '';
    for (const key in g_Object_Service) {
        if (g_Object_Service.hasOwnProperty(key)) {
            strOutput += key + ',' + g_Object_Service[key] + '\r\n';
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getNetworkObjectGroupListAsString() {
    let strOutput = '';
    for (const key in g_ObjectGroup_Network) {
        if (g_ObjectGroup_Network.hasOwnProperty(key)) {
            const array = g_ObjectGroup_Network[key];
            for (let i=0; i<array.length; ++i) {
                strOutput += key + ',' + array[i] + '\r\n';
            }
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getServiceObjectGroupListAsString() {
    let strOutput = '';
    for (const key in g_ObjectGroup_Service) {
        if (g_ObjectGroup_Service.hasOwnProperty(key)) {
            const array = g_ObjectGroup_Service[key];
            for (let i=0; i<array.length; ++i) {
                strOutput += key + ',' + array[i] + '\r\n';
            }
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getProtocolObjectGroupListAsString() {
    let strOutput = '';
    for (const key in g_ObjectGroup_Protocol) {
        if (g_ObjectGroup_Protocol.hasOwnProperty(key)) {
            const array = g_ObjectGroup_Protocol[key];
            for (let i=0; i<array.length; ++i) {
                strOutput += key + ',' + array[i] + '\r\n';
            }
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getIcmpTypeObjectGroupListAsString() {
    let strOutput = '';
    for (const key in g_ObjectGroup_IcmpType) {
        if (g_ObjectGroup_IcmpType.hasOwnProperty(key)) {
            const array = g_ObjectGroup_IcmpType[key];
            for (let i=0; i<array.length; ++i) {
                strOutput += key + ',' + array[i] + '\r\n';
            }
        }
    }
    return strOutput;
}

/**
* @return {string}
*/
function getPortObjectGroupListAsString() {
    let strOutput = '';
    for (const key in g_ObjectGroup_Port) {
        if (g_ObjectGroup_Port.hasOwnProperty(key)) {
            const array = g_ObjectGroup_Port[key];
            for (let i=0; i<array.length; ++i) {
                strOutput += key + ',' + array[i] + '\r\n';
            }
        }
    }
    return strOutput;
}

/*
* ============================================================================
* Debug code
* ============================================================================
*/
/**
*/
function outputName() {
    debugLog(`--- Name ---`);
    debugLog(g_Name);
}
/**
*/
function outputNetworkObject() {
    debugLog(`--- Network Object ---`);
    debugLog(g_Object_Network);
}
/**
*/
function outputServiceObject() {
    debugLog(`--- Service Object ---`);
    debugLog(g_Object_Service);
}
/**
*/
function outputNetworkObjectGroup() {
    debugLog(`--- Network Object Group ---`);
    debugLog(g_ObjectGroup_Network);
}
/**
*/
function outputProtocolObjectGroup() {
    debugLog(`--- Protocol Object Group ---`);
    debugLog(g_ObjectGroup_Protocol);
}
/**
*/
function outputServiceObjectGroup() {
    debugLog(`--- Service Object Group ---`);
    debugLog(g_ObjectGroup_Service);
}
/**
*/
function outputPortObjectGroup() {
    debugLog(`--- Port Object Group ---`);
    debugLog(g_ObjectGroup_Port);
}

// ===========================================================================
// EOF
// ===========================================================================
