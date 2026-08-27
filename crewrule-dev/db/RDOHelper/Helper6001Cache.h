/**
 * @file Helper6001Cache.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-12-18
**/


#ifndef CREWRULE_HELPER6001CACHE_H
#define CREWRULE_HELPER6001CACHE_H

#include <string>
#include <set>
#include "Helper6001TypeDefine.h"

struct Helper6001CacheInfo{
    std::vector<unsigned char> desiredPattern;
    std::vector<std::set<unsigned char>> rdoMustCoverDays;
    unsigned char minSpacingBetweenRDOs;
};

class Helper6001Cache {
public:
    using EnumerationType = Helper6001TypeDefine::EnumerationType;
    using CacheType = Helper6001TypeDefine::CacheType;

    bool GetEnumerationStatus(const Helper6001CacheInfo& cacheInfo) const;
    CacheType::const_iterator GetEnumeration(const Helper6001CacheInfo& cacheInfo) const;
    CacheType::const_iterator SetEnumeration(const Helper6001CacheInfo& cacheInfo, EnumerationType&& enumeration);

private:

    CacheType _cachedEnumeration;

    static std::string GetEnumerationKey(const Helper6001CacheInfo& cacheInfo);
};

#endif //CREWRULE_HELPER6001CACHE_H
