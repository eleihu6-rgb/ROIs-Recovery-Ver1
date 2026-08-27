/**
 * @file Helper6001Cache.cpp
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-12-18
**/
#include "Helper6001Cache.h"

bool Helper6001Cache::GetEnumerationStatus(const Helper6001CacheInfo &cacheInfo) const {
    return _cachedEnumeration.find(GetEnumerationKey(cacheInfo)) != _cachedEnumeration.end();
}

Helper6001Cache::CacheType::const_iterator
Helper6001Cache::GetEnumeration(const Helper6001CacheInfo &cacheInfo) const {
    return _cachedEnumeration.find(GetEnumerationKey(cacheInfo));
}

Helper6001Cache::CacheType::const_iterator
Helper6001Cache::SetEnumeration(const Helper6001CacheInfo &cacheInfo, Helper6001Cache::EnumerationType &&enumeration) {
    return _cachedEnumeration.insert({GetEnumerationKey(cacheInfo), enumeration}).first;
}

std::string Helper6001Cache::GetEnumerationKey(const Helper6001CacheInfo &cacheInfo) {
    std::string result;
    for (const auto& element: cacheInfo.desiredPattern) {
        result.append(std::to_string((unsigned int)element));
        result.append("+");
    }
    result.pop_back();
    result.append("^");
    for (const auto& element: cacheInfo.rdoMustCoverDays) {
        for (const auto& day: element) {
            result.append(std::to_string(day));
            result.append("_");
        }
        result.pop_back();
        result.append("|");
    }
    result.pop_back();
    result.append("^");

    result.append("M");
    result.append(std::to_string(cacheInfo.minSpacingBetweenRDOs));
    return result;
}
