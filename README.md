# FlatAsaAcl

**No warranty of any kind: use at your own risk.**

## Summary

Because complicate ACL can not understand easy, often desired to convert to simple ACL. In some cases, that is requested from only the configuration file. This script flattens ACL in the Cisco ASA configuration. Also, it can look up the specified addresses in the flattened ACL to confirm whether the addresses match.

Note that the ACL flattened can not input to Cisco ASA. It is to make complicate ACL easy to understand.

## Getting Started

[Download the ZIP file](https://github.com/joelob99/flatAsaAcl) from the branch and extracts it.
Open flatAsaAcl.html on Firefox, Chrome or Microsoft Edge(Chromium base), and follows the steps described on the page.

## Flattened ACL

Flattened ACL is described in the following format.

```
ACL_NAME,ACL_LINE,{standard|extended},{permit|deny},PROT,S_ADDR,S_PORT,D_ADDR,D_PORT,I_TPCD,{active|inactive}[,ACL_ELEMENT]

  ACL_NAME      access-list name
  ACL_LINE      access-list line number
  PROT          protocol name or number
  S_ADDR        source network address
  S_PORT        source port condition
  D_ADDR        destination network address
  D_PORT        destination port condition
  I_TPCD        icmp-type and icmp-code
  ACL_ELEMENT   access-list element
```

  - ACL_NAME and ACL_LINE are the same as configuration.
  - PROT format is the following. The protocol name except 'ip' is converted to the number. If the protocol name is 'ip', it is not converted.

        'NN'

        NN: protocol-number or 'ip'
  
  - S_PORT and D_PORT format are the following. The port name is converted to the number. If PROT is 'ip', 'icmp', or 'icmp6', S_PORT and D_PORT are described as '-/-'. If PROT is tcp or udp and the port condition is not specified, S_PORT and D_PORT are described as 'eq/any'.

        'eq/NN'
        'lt/NN'
        'gt/NN'
        'neq/NN'
        'range/SN-EN'

        NN: port-number or 'any'
        SN: start port-number
        EN: end port-number

  - I_TPCD format is the following. The icmp-type name is converted to the number. If icmp-type or icmp-code is not specified explicitly, it is described as 'any'. If PROT is 'ip', I_TPCD is described as '-/-'.

        'TN/CN'

        TN: icmp-type number or 'any'
        CN: icmp-code number or 'any'

  - S_ADDR and D_ADDR are CIDR representation if the network address is host or subnet address. IPv6 address is adapted to the full represented. If the network address is FQDN, it is described as-is. If the network address is a range, S_ADDR and D_ADDR are not CIDR representation. Its address is described in start-address, a hyphen, end-address as following.

        IPv4: 'x.x.x.x-y.y.y.y'
        IPv6: 'xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx-yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy:yyyy'

    'Any' network address is changed as following rules.

        'any': '0/0'
        'any4': '0.0.0.0/0'
        'any6': '0000:0000:0000:0000:0000:0000:0000:0000/0'

  - ACL_ELEMENT is the access-list command representation. This is not the same as the list shown by 'show access-list' command.

Flattening changes object and object-group of ACE to those values. If an object-group has two or more objects, the ACE is expanded to the same number as objects in the object-group. For example, when object, object-group, and ACL are defined in the configuration as following, the ACL is expanded two entries.

- Configuration:

      object network OBJ1
       host 192.168.0.1
      object-group network OGRP1
       network-object host 10.0.0.1
      object-group network OGRP2
       network-object host 10.1.1.1
       group-object OGRP1
      access-list ACL1 extended permit tcp object OBJ1 object-group OGRP2 eq www

- Flattend ACL:

      ACL1,1,extended,permit,6,192.168.0.1/32,eq/any,10.1.1.1/32,eq/80,-/-,active,access-list ACL1 line 1 extended permit tcp host 192.168.0.1 host 10.1.1.1 eq www
      ACL1,1,extended,permit,6,192.168.0.1/32,eq/any,10.0.0.1/32,eq/80,-/-,active,access-list ACL1 line 1 extended permit tcp host 192.168.0.1 host 10.0.0.1 eq www

## How to use scripts.

The following is a sample code for flattening ACL.

    let temp = [];
    let resultAll = [];
    let resultNetwork = [];
    makeAsaObjectList(textConfig);
    makeAsaObjectGroupList(textConfig);
    makeProtocolTypeBitList();
    normalizeAcl(textConfig, temp);
    flattenNormalizedAcl(temp, true, true, true, true, true, true, resultNetwork, resultAll);

After flattened ACL, it can look up addresses by calling lookUpAddrList function.

    let matched = [];
    let matchedEI = []; // excluded ineffectual entries.
    lookUpAddrList(resultAll, textAddrList, matched, matchedEI);

See flatAsaAcl.html for detail.

## Limitation

- Extended and standard ACL types are supported. EtherType and webtype ACL types are not supported.
- IP Address-Based, FQDN-Based, TCP-Based, UDP-Based, and ICMP-Based are supported in an extended ACE. User-Based and Security Group-Based are not supported.
- IP, ICMP, ICMP6, TCP, and UDP protocols are supported. Though other protocols are not supported, its names are converted to the number.
- NAT is not supported. Also, the nat type of network object is not supported.
- In lookup, the deny ACL, which is IPv4 to any4 and IPv6 to any6, is not interpreted as ineffectual due to the traffic from IPv4 to IPv6 and from IPv6 to IPv4 are considered.
- FQDN is not resolved to its IP address when lookup. Therefore, it can not be recognized whether FQDN is within the IP segment or the IP range.
