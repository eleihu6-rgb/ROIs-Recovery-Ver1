//
// Created by haoli on 2025/11/11.
//

#ifndef RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPER_H
#define RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPER_H

#include <set>
#include <map>
#include <vector>
#include <climits>
#include <unordered_map>
#include <algorithm>
#include <numeric>
#include "EnumerationDayOffPatternHelperCache.h"
#include "EnumerationDayOffPatternHelperTypeDefine.h"
#include "EnumerationNumericUtil.h"
template<size_t NumBits>
class EnumerationDayOffPatternHelper {
public:

    explicit EnumerationDayOffPatternHelper() = default;

    using EnumerationType = typename EnumerationDayOffPatternHelperTypeDefine<NumBits>::EnumerationType;
    using EnumerationElementType = typename EnumerationDayOffPatternHelperTypeDefine<NumBits>::EnumerationElementType;


    EnumerationType GetAllPossiblePattern(EnumerationDayOffPatternHelperCache<NumBits>& helperCache, EnumerationDayOffPatternHelperCacheInfo &helperCacheInfo, EnumerationCrewValue &crewValue){
        EnumerationElementType availableSlot;
        EnumerationElementType lockDOSlot;
        EnumerationElementType breakConsecutiveWorkingSlot;
        unsigned char alreadyAssignedDONumber = 0;
        for (std::size_t i = 0; i < NumBits; i++) {
            switch (crewValue.slotStatus.at(i)) {
                case EnumerationOccupationStatus::DUTY_OCCUPIED:
                    // slot with above status is not allowed to be assigned with DO
                    break;
                case EnumerationOccupationStatus::DAYS_OFF_OCCUPIED:
                    // already occupied DO day is availableSlot in the enumeration
                    availableSlot.set(i, true);
                    lockDOSlot.set(i, true);
                    ++alreadyAssignedDONumber;
                    break;
                case EnumerationOccupationStatus::ANNUAL_LEAVE_OCCUPIED:
                    // AL can be break consecutive days as DO does
                    breakConsecutiveWorkingSlot.set(i, true);
                    break;
                default:
                    // all other slot is valid for DO to be
                    availableSlot.set(i, true);
                    break;
            }
        }

        EnumerationType result;
        typename CacheType::const_iterator it;
        if (helperCache.GetEnumerationStatus(helperCacheInfo)) {
            it = helperCache.GetEnumeration(helperCacheInfo);
        } else {
            // if the cache isn't found, enumerate once
            it = GenerateEnumeration(helperCache, helperCacheInfo);
        }
        if(it->second.empty()) return result;
        result = MatchPossiblePatternByRange(0, it->second.size(), it->second, availableSlot, lockDOSlot, breakConsecutiveWorkingSlot, helperCacheInfo, crewValue);
        return result;
    }

    inline void SetPrintEnumerationResult(bool flag) { _printEnumerationResult = flag; }

private:
    // helper members
    std::vector<std::vector<unsigned int>> _possibleCombination;
    std::vector<unsigned int> _combinationHolder;
    bool _printEnumerationResult = false;

    using CacheType = std::map<std::string, EnumerationType>;

    void FindPossibleCombinationSumUpToTarget(unsigned int target, unsigned char numberCount,
                                              const std::vector<unsigned int> &candidates,
                                              unsigned char internalIndexForRecursion = 0){

        if (internalIndexForRecursion == candidates.size() || _combinationHolder.size() == numberCount) {
            /*
             * The combination needs to satisfy:
             * 1. add up to target
             * NOTE: check consecutive days cannot be done here, because SDO can break consecutive days
             */
            if (target == 0) {
                _possibleCombination.emplace_back(_combinationHolder);
            }
            return; // recursion finish
        }
        const unsigned int& pick = candidates.at(internalIndexForRecursion);
        if (pick <= target) {
            _combinationHolder.emplace_back(pick);
            FindPossibleCombinationSumUpToTarget(target - pick, numberCount, candidates, internalIndexForRecursion);
            _combinationHolder.pop_back();
        }

        FindPossibleCombinationSumUpToTarget(target, numberCount, candidates, internalIndexForRecursion + 1);
    }

    /*
     * GeneratePattern will check the DO rules:
     * 1. Must cover some days as specified
     */
    bool GeneratePattern(const std::vector<unsigned int> &blankDayEnumeration,
                         const std::vector<unsigned char> &patternEnumeration,
                         EnumerationElementType &result, EnumerationDayOffPatternHelperCacheInfo &helperCacheInfo) {
        unsigned char currentBit = 0;
        for (std::size_t i = 0; i < patternEnumeration.size(); ++i) {
            currentBit += blankDayEnumeration.at(i);
            currentBit += (int) (i > 0) * helperCacheInfo.ruleParam->minSpacingBetweenConsecutiveDOs;
            for (int j = 0; j < patternEnumeration.at(i); ++j) {
                result.set(currentBit);
                ++currentBit;
            }
        }
        // after generating the pattern check the pattern is legal or not
        // 1. Must cover day
        bool findMustMatch = false;
        if (helperCacheInfo.ruleParam->doMustCoverDays.empty()) return true;
        findMustMatch = std::any_of(helperCacheInfo.ruleParam->doMustCoverDays.begin(),
                                    helperCacheInfo.ruleParam->doMustCoverDays.end(),
                                    [&](const std::set<unsigned char> &mustCoverSet) {
                                        for (const auto &day: mustCoverSet) { if (!result.test(day)) return false; }
                                        return true;
                                    });
        return findMustMatch;
    }

    // pass by copy to use permutation
    typename CacheType::const_iterator GenerateEnumeration(EnumerationDayOffPatternHelperCache<NumBits>& helperCache, EnumerationDayOffPatternHelperCacheInfo& cacheInfo){
        EnumerationType enumerations;
        std::vector<unsigned char> originalPattern = cacheInfo.desiredPattern;
        // sort the desired pattern for successful next_permutation
        if (!cacheInfo.ruleParam->permutation) {
            std::sort(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end());
        }
        // get the total number of blank day and target blank day for combination sum
        unsigned char blankDay = std::accumulate(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end(), (unsigned char)NumBits, std::minus<>());
        unsigned char targetBlankDayForCombinationSum = blankDay - ((unsigned char)cacheInfo.desiredPattern.size() - 1) * cacheInfo.ruleParam->minSpacingBetweenConsecutiveDOs;
        // number of interval (numberCount) is desiredPattern size() + 1
        unsigned char numberCount = (unsigned char)cacheInfo.desiredPattern.size() + 1;
        // reserve the vector size for faster speed
        auto theoreticalCount = (std::size_t)EnumerationNumericUtil::GetEnumerationCount(cacheInfo.desiredPattern, NumBits);
        enumerations.reserve(theoreticalCount);

        // by default, candidates filled with {1, 2, 3, ..., target}
        std::vector<unsigned int> candidates(targetBlankDayForCombinationSum);
        std::iota(candidates.begin(), candidates.end(), 1);

        FindPossibleCombinationSumUpToTarget(targetBlankDayForCombinationSum, numberCount, candidates);
        _combinationHolder.clear();
        // fill all the combination vector to numberCount length, filling with 0 if vacancy, then sort (necessary for next_permutation to work)
        for (auto& combination : _possibleCombination) {
            if (combination.size() < numberCount) {
                combination.resize(numberCount, 0);
            }
            std::sort(combination.begin(), combination.end());
        }
        unsigned int actCount = 0;
        if(cacheInfo.ruleParam->permutation){
            for (auto& combination : _possibleCombination) {
                do {
                    EnumerationElementType singlePattern;
                    bool success = GeneratePattern(combination, cacheInfo.desiredPattern, singlePattern, cacheInfo);
                    if (!success) continue;
                    ++actCount;
                    enumerations.emplace_back(singlePattern);
                } while (std::next_permutation(combination.begin(), combination.end()));
            }
        } else {
            do {
                for (auto& combination : _possibleCombination) {
                    do {
                        EnumerationElementType singlePattern;
                        bool success = GeneratePattern(combination, cacheInfo.desiredPattern, singlePattern, cacheInfo);
                        if (!success) continue;
                        ++actCount;
                        enumerations.emplace_back(singlePattern);
                    } while (std::next_permutation(combination.begin(), combination.end()));
                }
            } while (std::next_permutation(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end()));
        }


        _possibleCombination.clear();

        //!ATTENTION: need to guarantee the security of multithreading parallel
        return helperCache.SetEnumeration(cacheInfo, std::move(enumerations));
    }

    EnumerationType MatchPossiblePatternByRange(std::size_t startIndex, std::size_t endIndex,
                                                  const EnumerationType& storedEnumeration,
                                                  const EnumerationElementType& availableSlot,
                                                  const EnumerationElementType& lockDOSlot,
                                                  const EnumerationElementType& breakConsecutiveWorkingSlot,
                                                  EnumerationDayOffPatternHelperCacheInfo &helperCacheInfo,
                                                  EnumerationCrewValue &crewValue) const{
        EnumerationType result;
        result.reserve(storedEnumeration.size());
        auto checkCount = storedEnumeration.front().count();
        auto lockCount = lockDOSlot.count();
        if ((double)endIndex >= 0.99 * (double)storedEnumeration.size()) {
            endIndex = storedEnumeration.size();
        }
        for (std::size_t i = startIndex; i < endIndex; ++i) {
            if ((availableSlot & storedEnumeration.at(i)).count() == checkCount
                && (lockDOSlot & storedEnumeration.at(i)).count() == lockCount
                // check consecutive days at the last because it's the slowest
                && CheckMaxConsecutiveDayRuleForCombinationHolder(storedEnumeration.at(i), breakConsecutiveWorkingSlot, helperCacheInfo, crewValue)) {
                result.emplace_back(storedEnumeration.at(i));
            }
        }
        return result;
    }

    bool CheckMaxConsecutiveDayRuleForCombinationHolder(const EnumerationElementType& testPattern, const EnumerationElementType& breakConsecutiveWorkingSlot, EnumerationDayOffPatternHelperCacheInfo &helperCacheInfo, EnumerationCrewValue &crewValue) const{
        unsigned char currentConsecutiveDayCounter = crewValue.previousConsecutiveDays;
        unsigned int curIdx = 0;
        std::map<unsigned int, unsigned int> exceptionTimes;

        auto CheckConsecutiveDayCount = [&](unsigned char count) {
            if (count <= helperCacheInfo.ruleParam->defaultMaxConsecutiveDay) return true;
            const auto it = helperCacheInfo.ruleParam->exceptionConsecutiveDay.lower_bound(count);
            // no find any upper exceptions
            if (it == helperCacheInfo.ruleParam->exceptionConsecutiveDay.end()) return false;
            // if used exceptions check the current used time
            if (exceptionTimes[it->first] >= it->second) return false;
            // update currently used exception time
            ++exceptionTimes.at(it->first);
            return true;
        };

        for (std::size_t i = 0; i < NumBits; ++i) {

            if (!testPattern.test(i) && !breakConsecutiveWorkingSlot.test(i)) {
                // if no DO assigned
                ++currentConsecutiveDayCounter;
            }
            else {
                // if DO assigned
                if (currentConsecutiveDayCounter != 0) {
                    // check the previous roster period consecutive days
                    if (curIdx == 0 && NumBits != 0) {
                        if (currentConsecutiveDayCounter > helperCacheInfo.ruleParam->previousRosterPeriodMaxConsecutiveDay) {
                            return false;
                        }
                        if (currentConsecutiveDayCounter > helperCacheInfo.ruleParam->defaultMaxConsecutiveDay){
                            const auto it = helperCacheInfo.ruleParam->exceptionConsecutiveDay.lower_bound(currentConsecutiveDayCounter);
                            if (it == helperCacheInfo.ruleParam->exceptionConsecutiveDay.end()) return false;
                            if (exceptionTimes[it->first] >= it->second) return false;
                            ++exceptionTimes.at(it->first);
                        }
                    }
                        // if no previous consecutive days, check the first consecutive days as normal
                    else {
                        if (!CheckConsecutiveDayCount(currentConsecutiveDayCounter)) return false;
                    }
                }
                curIdx++;
                currentConsecutiveDayCounter = 0;
            }
        }
        // add leadout consecutive days to the last
        if (currentConsecutiveDayCounter != 0)
            if (!CheckConsecutiveDayCount(currentConsecutiveDayCounter + crewValue.leadoutConsecutiveDays)) return false;

        return true;
    }

};

#endif //RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPER_H
