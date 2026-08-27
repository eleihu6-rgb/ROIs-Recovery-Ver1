//
// Created by haoli on 2025/11/11.
//

#ifndef RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERCACHE_H
#define RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERCACHE_H


#include <string>
#include <set>
#include "EnumerationDayOffPatternHelperTypeDefine.h"

enum class EnumerationOccupationStatus {
    DUTY_OCCUPIED,
    DAYS_OFF_AVAILABLE,
    DAYS_OFF_OCCUPIED,
    ANNUAL_LEAVE_OCCUPIED
};
struct EnumerationRuleParam {
    // rule parameters
    unsigned char defaultMaxConsecutiveDay{0};                     // consecutive day
    unsigned char previousRosterPeriodMaxConsecutiveDay{0};        // consecutive day
    std::map<unsigned int, unsigned int> exceptionConsecutiveDay;  // consecutive day
    unsigned char minSpacingBetweenConsecutiveDOs{1};              // min spacing
    unsigned char totalNumDONeeded{8};                             // total number of days off
    std::vector<std::set<unsigned char>> doMustCoverDays;          // DO enumerator also need to fully cover some days
    bool permutation;
};

struct EnumerationCrewValue {
    // crew parameters
    unsigned char previousConsecutiveDays{0};
    unsigned char leadoutConsecutiveDays{0};
    std::vector<EnumerationOccupationStatus> slotStatus;
};

struct EnumerationDayOffPatternHelperCacheInfo{
    EnumerationRuleParam *ruleParam;
    std::vector<unsigned char> desiredPattern;
    long long instanceId;
};

template<size_t NumBits>
class EnumerationDayOffPatternHelperCache {
public:
    using EnumerationType = typename EnumerationDayOffPatternHelperTypeDefine<NumBits>::EnumerationType;
    using CacheType = typename EnumerationDayOffPatternHelperTypeDefine<NumBits>::CacheType;

    bool GetEnumerationStatus(const EnumerationDayOffPatternHelperCacheInfo& cacheInfo) const{
        return _cachedEnumeration.find(GetEnumerationKey(cacheInfo)) != _cachedEnumeration.end();
    }
    typename CacheType::const_iterator GetEnumeration(const EnumerationDayOffPatternHelperCacheInfo& cacheInfo) const{
        return _cachedEnumeration.find(GetEnumerationKey(cacheInfo));
    }
    typename CacheType::const_iterator SetEnumeration(const EnumerationDayOffPatternHelperCacheInfo& cacheInfo, EnumerationType&& enumeration){
        return _cachedEnumeration.insert({GetEnumerationKey(cacheInfo), enumeration}).first;
    }

private:

    CacheType _cachedEnumeration;

    static std::string GetEnumerationKey(const EnumerationDayOffPatternHelperCacheInfo& cacheInfo){
        std::string result;

        result.append(std::to_string(cacheInfo.instanceId));
        result.append("^");
        for (const auto& element: cacheInfo.desiredPattern) {
            result.append(std::to_string((unsigned int)element));
            result.append("+");
        }
        result.pop_back();

        return result;
    }
};
#endif //RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERCACHE_H
