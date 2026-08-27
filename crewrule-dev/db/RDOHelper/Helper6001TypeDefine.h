/**
 * @file HelperTypeDefine.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-12-18
**/


#ifndef CREWRULE_HELPERTYPEDEFINE_H
#define CREWRULE_HELPERTYPEDEFINE_H

#include <vector>
#include <bitset>
#include <map>

struct Helper6001TypeDefine {
    static constexpr std::size_t RosterPeriodLength = 28;
    using EnumerationType = std::vector<std::bitset<RosterPeriodLength>>;
    using CacheType = std::map<std::string, EnumerationType>;
};

#endif //CREWRULE_HELPERTYPEDEFINE_H
