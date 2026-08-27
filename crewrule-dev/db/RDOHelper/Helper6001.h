/**
 * @file Helper6001.h
 * @brief
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-11-07
**/


#ifndef NEWRULEENGINE_HELPER6001_H
#define NEWRULEENGINE_HELPER6001_H

#include <set>
#include <map>
#include <vector>
#include <bitset>
#include <climits>
#include "Helper6001Cache.h"
#include "Helper6001TypeDefine.h"

class Helper6001 {
public:

    explicit Helper6001();

    static constexpr std::size_t RosterPeriodLength = Helper6001TypeDefine::RosterPeriodLength;
    using EnumerationType = Helper6001TypeDefine::EnumerationType;
    enum class OccupationStatus {
        DUTY_OCCUPIED,
        ROSTER_DAYS_OFF_AVAILABLE,
        ROSTER_DAYS_OFF_OCCUPIED,
        UNASSIGNED_DAY_AVAILABLE,
        UNASSIGNED_DAY_OCCUPIED,
        SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT,
        ANNUAL_LEAVE_OCCUPIED
    };

    EnumerationType GetAllPossiblePattern(Helper6001Cache& helperCache, const std::vector<OccupationStatus>& slotStatus, const std::vector<unsigned char>& desiredPattern);

    inline void SetDefaultMaxConsecutiveDays(unsigned char days) { _defaultMaxConsecutiveDay = days; }
    inline void SetPreviousRosterPeriodMaxConsecutiveDays(unsigned char days) { _previousRosterPeriodMaxConsecutiveDay = days; }
    inline void SetMinSpacingBetweenConsecutiveRDOs(unsigned char minSpacingBetweenConsecutiveRDOs) { _minSpacingBetweenConsecutiveRDOs = minSpacingBetweenConsecutiveRDOs; }
    inline void SetTotalNumRDONeeded(unsigned char totalNumRDONeeded) { _totalNumRDONeeded = totalNumRDONeeded; }
    inline void SetExceptionMaxConsecutiveDays(unsigned int days, unsigned int times) { _exceptionConsecutiveDay[days] = times; }
    inline void AddMustCoverDays(std::set<unsigned char> daySet) { _rdoMustCoverDays.emplace_back(std::move(daySet)); }

    inline void SetPreviousConsecutiveDays(unsigned char previousConsecutiveDays) { _previousConsecutiveDays = previousConsecutiveDays; }
    inline void SetLeadoutConsecutiveDays(unsigned char leadoutConsecutiveDays) { _leadoutConsecutiveDays = leadoutConsecutiveDays; }

    inline void SetPrintEnumerationResult(bool flag) { _printEnumerationResult = flag; }
    inline void SetInternalMultiThreading(bool flag) { _internalMultithreading = flag; }

    static void SetMatchPatternMemPoolSize(size_t poolSize){
        if (Helper6001::_matchPatternMemPool.capacity() < poolSize) {
            Helper6001::_matchPatternMemPool.reserve(poolSize);
        }
    }

private:
    // rule parameters 
    unsigned char _defaultMaxConsecutiveDay{ 0 };
    unsigned char _previousRosterPeriodMaxConsecutiveDay{ 0 };
    unsigned char _minSpacingBetweenConsecutiveRDOs{ 1 };
    unsigned char _totalNumRDONeeded{ 8 };
    std::map<unsigned int, unsigned int> _exceptionConsecutiveDay; // consecutive days: number of exceptions
    std::vector<std::set<unsigned char>> _rdoMustCoverDays; // RDO enumerator also need to fully cover some days

    // crew parameters 
    unsigned char _previousConsecutiveDays{ 0 };
    unsigned char _leadoutConsecutiveDays{ 0 };

    // helper members
    std::vector<std::vector<unsigned int>> _possibleCombination;
    std::vector<unsigned int> _combinationHolder;
    bool _printEnumerationResult = false;
    bool _internalMultithreading = false;
    static EnumerationType _matchPatternMemPool;

    using CacheType = std::map<std::string, EnumerationType>;
    EnumerationType GetAllPossiblePatternInternal(Helper6001Cache& helperCache,
                                                  const std::bitset<RosterPeriodLength>& availableSlot,
                                                  const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                  const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot,
                                                  const std::vector<unsigned char>& desiredPattern);

    /*
     * GeneratePattern will check the RDO rules:
     * 1. Must cover some days as specified
     */
    bool GeneratePattern(const std::vector<unsigned int>& blankDayPermutation,
                         const std::vector<unsigned char>& patternPermutation,
                         std::bitset<RosterPeriodLength>& result);
    static uint64_t GetEnumerationCount(const std::vector<unsigned char>& desiredPattern);
    inline static uint64_t GetFact(uint64_t n) { return (n == 1 || n == 0) ? 1 : GetFact(n - 1) * n; };
    static uint64_t GetSingleCombination(unsigned char chooseFrom, unsigned char choose);

    void FindPossibleCombinationSumUpToTarget(unsigned int target, unsigned char numberCount,
                                              const std::vector<unsigned int>& candidates,
                                              unsigned char internalIndexForRecursion = 0);

    CacheType::const_iterator GenerateEnumeration(Helper6001Cache& helperCache, Helper6001CacheInfo cacheInfo); // pass by copy to use permutation

    size_t MatchPossiblePatternByRange(std::size_t startIndex, std::size_t endIndex,
                                                const EnumerationType& storedEnumeration,
                                                const std::bitset<RosterPeriodLength>& availableSlot,
                                                const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot);

    EnumerationType MatchPossiblePatternByRangeMT(std::size_t startIndex, std::size_t endIndex,
                                                    const EnumerationType& storedEnumeration,
                                                    const std::bitset<RosterPeriodLength>& availableSlot,
                                                    const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                    const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot) const;

    bool CheckMaxConsecutiveDayRuleForCombinationHolder(const std::bitset<RosterPeriodLength>& testPattern, const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot) const;

};

#endif //NEWRULEENGINE_HELPER6001_H
