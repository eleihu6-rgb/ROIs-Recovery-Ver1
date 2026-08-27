/**
 * @file Helper6001.cpp
 * @brief
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-11-07
**/

#include <future>
#include <map>
#include <algorithm>
#include <numeric>
#include "Helper6001.h"
//include "spdlog/spdlog.h"

Helper6001::EnumerationType Helper6001::_matchPatternMemPool;

Helper6001::Helper6001() {
    /*SetDefaultMaxConsecutiveDays(5);
    SetPreviousRosterPeriodMaxConsecutiveDays(6);
    SetExceptionMaxConsecutiveDays(6, 1);*/

    //AddMustCoverDays({ 5, 6 });
    //AddMustCoverDays({ 12, 13 });
    //AddMustCoverDays({ 19, 20 });
    //AddMustCoverDays({ 26, 27 });
    Helper6001::SetMatchPatternMemPoolSize(20);
}

uint64_t Helper6001::GetSingleCombination(unsigned char chooseFrom, unsigned char choose) {
    if (choose > chooseFrom) return 0;
    if (choose * 2 > chooseFrom) choose = chooseFrom - choose;
    if (choose == 0) return 1;

    uint64_t result = chooseFrom;
    for (unsigned char i = 2; i <= choose; ++i) {
        result *= chooseFrom - i + 1;
        result /= i;
    }
    return result;
}

void Helper6001::FindPossibleCombinationSumUpToTarget(unsigned int target, unsigned char numberCount, const std::vector<unsigned int>& candidates, unsigned char internalIndexForRecursion) {

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

Helper6001::EnumerationType Helper6001::GetAllPossiblePattern(Helper6001Cache& helperCache, const std::vector<OccupationStatus>& slotStatus, const std::vector<unsigned char>& desiredPattern) {
    std::bitset<RosterPeriodLength> availableSlot;
    std::bitset<RosterPeriodLength> lockRDOSlot;
    std::bitset<RosterPeriodLength> breakConsecutiveWorkingSlot;
    unsigned char alreadyAssignedRDONumber = 0;
    for (std::size_t i = 0; i < RosterPeriodLength; i++) {
        switch (slotStatus.at(i)) {
        case OccupationStatus::DUTY_OCCUPIED:
        case OccupationStatus::UNASSIGNED_DAY_AVAILABLE:
        case OccupationStatus::UNASSIGNED_DAY_OCCUPIED:
            // slot with above status is not allowed to be assigned with RDO
            break;
        case OccupationStatus::ROSTER_DAYS_OFF_OCCUPIED:
            // already occupied RDO day is availableSlot in the enumeration
            availableSlot.set(i, true);
            lockRDOSlot.set(i, true);
            ++alreadyAssignedRDONumber;
            break;
        case OccupationStatus::SUBSTITUTED_DAYS_OFF_PRE_ASSIGNMENT:
        case OccupationStatus::ANNUAL_LEAVE_OCCUPIED:
            // SDO can be break consecutive days as RDO does
            breakConsecutiveWorkingSlot.set(i, true);
            break;
        default:
            // all other slot is valid for RDO to be
            availableSlot.set(i, true);
            break;
        }
    }
    // if already assigned RDO is greater than total number of demand, return the current assigned RDO pattern
    if (_totalNumRDONeeded <= alreadyAssignedRDONumber) return std::vector<std::bitset<RosterPeriodLength>>{lockRDOSlot};
    else return std::move(GetAllPossiblePatternInternal(helperCache, availableSlot, lockRDOSlot, breakConsecutiveWorkingSlot, desiredPattern));
}

Helper6001::EnumerationType Helper6001::GetAllPossiblePatternInternal(Helper6001Cache& helperCache,
                                                                      const std::bitset<RosterPeriodLength>& availableSlot,
                                                                      const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                                      const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot,
                                                                      const std::vector<unsigned char>& desiredPattern) {
    EnumerationType result;
    size_t resultSize = 0;
    CacheType::const_iterator it;
    Helper6001CacheInfo cacheInfo{ desiredPattern, _rdoMustCoverDays, _minSpacingBetweenConsecutiveRDOs };
    if (helperCache.GetEnumerationStatus(cacheInfo)) {
        it = helperCache.GetEnumeration(cacheInfo);
    }
    else {
        // if the cache isn't found, enumerate once
        it = GenerateEnumeration(helperCache, cacheInfo);
    }
    if (it->second.empty())
        return result;
    if (_internalMultithreading) {
        std::vector<std::future<EnumerationType>> futures;
		std::size_t slice = it->second.size() / (std::thread::hardware_concurrency() - 1);
		std::size_t currentLoc = 0;
        for (int i = 0; i < (int)std::thread::hardware_concurrency() - 1; ++i) {
            futures.emplace_back(
                std::async(std::launch::async, &Helper6001::MatchPossiblePatternByRangeMT, this, currentLoc, currentLoc + slice, it->second, availableSlot, lockRDOSlot, breakConsecutiveWorkingSlot)
            );
            currentLoc += slice;
        }
        for (auto& future : futures) {
            auto threadResult = future.get();
            result.insert(result.end(), std::make_move_iterator(threadResult.begin()), std::make_move_iterator(threadResult.end()));
        }
    }
    else {
        //result = MatchPossiblePatternByRangeMT(0, it->second.size(), it->second, availableSlot, lockRDOSlot, breakConsecutiveWorkingSlot);
       
        resultSize = Helper6001::MatchPossiblePatternByRange(0, it->second.size(), it->second, availableSlot, lockRDOSlot, breakConsecutiveWorkingSlot);
        if (resultSize) {
            result.reserve(resultSize);
            result.insert(result.end(), std::make_move_iterator(Helper6001::_matchPatternMemPool.begin()), std::make_move_iterator(Helper6001::_matchPatternMemPool.begin() + resultSize));
            Helper6001::_matchPatternMemPool.clear();
        }
    }
    return result;
}

Helper6001::CacheType::const_iterator Helper6001::GenerateEnumeration(Helper6001Cache& helperCache, Helper6001CacheInfo cacheInfo) {

    EnumerationType enumerations;
    // sort the desired pattern for successful next_permutation
    std::sort(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end());
    // get the total number of blank day and target blank day for combination sum
    unsigned char blankDay = std::accumulate(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end(), (unsigned char)RosterPeriodLength, std::minus<>());
    unsigned char targetBlankDayForCombinationSum = blankDay - ((unsigned char)cacheInfo.desiredPattern.size() - 1) * cacheInfo.minSpacingBetweenRDOs;
    // number of interval (numberCount) is desiredPattern size() + 1
    unsigned char numberCount = (unsigned char)cacheInfo.desiredPattern.size() + 1;
    // reserve the vector size for faster speed
    auto theoreticalCount = (std::size_t)GetEnumerationCount(cacheInfo.desiredPattern);
    enumerations.reserve(theoreticalCount);
    //    spdlog::info("Theoretical Enumeration Count: {0:-^10} for roster period length: {1:-^4}, desired pattern: {2:-^20}",
    //                 theoreticalCount, RosterPeriodLength, cacheInfo.desiredPatternString);

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
    do {
        for (auto& combination : _possibleCombination) {
            do {
                std::bitset<RosterPeriodLength> singlePattern;
                bool success = GeneratePattern(combination, cacheInfo.desiredPattern, singlePattern);
                if (!success) continue;
                ++actCount;
                //                if (_printEnumerationResult) {
                //                    spdlog::info("Binary: {0:0>28b} - Long: {0:>12}", singlePattern.to_ulong());
                //                }
                enumerations.emplace_back(singlePattern);
            } while (std::next_permutation(combination.begin(), combination.end()));
        }
    } while (std::next_permutation(cacheInfo.desiredPattern.begin(), cacheInfo.desiredPattern.end()));

    _possibleCombination.clear();
    //    spdlog::info("Actual enumeration: {0:-^10} for roster period length: {1:-^4}, desired pattern: {2:-^16}",
    //                 actCount, RosterPeriodLength, cacheInfo.desiredPatternString);

    //!ATTENTION: need to guarantee the security of multithreading parallel
    return helperCache.SetEnumeration(cacheInfo, std::move(enumerations));
}

bool Helper6001::GeneratePattern(const std::vector<unsigned int>& blankDayPermutation,
                                 const std::vector<unsigned char>& patternPermutation,
                                 std::bitset<Helper6001::RosterPeriodLength>& result) {

    unsigned char currentBit = 0;
    for (std::size_t i = 0; i < patternPermutation.size(); ++i) {
        currentBit += blankDayPermutation.at(i);
        currentBit += (int)(i > 0) * _minSpacingBetweenConsecutiveRDOs;
        for (int j = 0; j < patternPermutation.at(i); ++j) {
            result.set(currentBit);
            ++currentBit;
        }
    }
    // after generating the pattern check the pattern is legal or not
    // 1. Must cover day
    bool findMustMatch = false;
    if (_rdoMustCoverDays.empty()) return true;
    findMustMatch = std::any_of(_rdoMustCoverDays.begin(), _rdoMustCoverDays.end(), [&](const std::set<unsigned char>& mustCoverSet) {
        for (const auto& day : mustCoverSet) { if (!result.test(day)) return false; }
        return true;
        });
    return findMustMatch;
}

uint64_t Helper6001::GetEnumerationCount(const std::vector<unsigned char>& desiredPattern) {
    // get the total number of blank day and target blank day for combination sum
    unsigned char blankDay = std::accumulate(desiredPattern.begin(), desiredPattern.end(), (unsigned char)RosterPeriodLength, std::minus<>());
    unsigned char targetBlankDayForCombinationSum = blankDay - (unsigned char)desiredPattern.size() + 1;
    uint64_t combinationSumCalCount = GetSingleCombination(targetBlankDayForCombinationSum + (unsigned char)desiredPattern.size(), (unsigned char)desiredPattern.size());

    std::map<unsigned char, unsigned char> uniqueCount;
    for (const auto& element : desiredPattern) {
        uniqueCount[element] += 1;
    }
    uint64_t patternPermutationCount = GetFact(desiredPattern.size());
    for (const auto& pair : uniqueCount) {
        patternPermutationCount /= GetFact(pair.second);
    }
    return combinationSumCalCount * patternPermutationCount;
}

size_t Helper6001::MatchPossiblePatternByRange(std::size_t startIndex, std::size_t endIndex,
                                                                    const Helper6001::EnumerationType& storedEnumeration,
                                                                    const std::bitset<RosterPeriodLength>& availableSlot,
                                                                    const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                                    const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot) {
    size_t resultSize = 0;
    auto checkCount = storedEnumeration.front().count();
    auto lockCount = lockRDOSlot.count();
    if ((double)endIndex >= 0.99 * (double)storedEnumeration.size()) {
        endIndex = storedEnumeration.size();
    }
    for (std::size_t i = startIndex; i < endIndex; ++i) {
        if ((availableSlot & storedEnumeration.at(i)).count() == checkCount
            && (lockRDOSlot & storedEnumeration.at(i)).count() == lockCount
            // check consecutive days at the last because it's the slowest
            && CheckMaxConsecutiveDayRuleForCombinationHolder(storedEnumeration.at(i), breakConsecutiveWorkingSlot)) {
            Helper6001::_matchPatternMemPool.emplace_back(storedEnumeration.at(i));
            resultSize++;
        }
    }
    return resultSize;
}

Helper6001::EnumerationType Helper6001::MatchPossiblePatternByRangeMT(std::size_t startIndex, std::size_t endIndex,
                                                                    const Helper6001::EnumerationType& storedEnumeration,
                                                                    const std::bitset<RosterPeriodLength>& availableSlot,
                                                                    const std::bitset<RosterPeriodLength>& lockRDOSlot,
                                                                    const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot) const {
    EnumerationType result;
    result.reserve(storedEnumeration.size());
    auto checkCount = storedEnumeration.front().count();
    auto lockCount = lockRDOSlot.count();
    if ((double)endIndex >= 0.99 * (double)storedEnumeration.size()) {
        endIndex = storedEnumeration.size();
    }
    for (std::size_t i = startIndex; i < endIndex; ++i) {
        if ((availableSlot & storedEnumeration.at(i)).count() == checkCount
            && (lockRDOSlot & storedEnumeration.at(i)).count() == lockCount
            // check consecutive days at the last because it's the slowest
            && CheckMaxConsecutiveDayRuleForCombinationHolder(storedEnumeration.at(i), breakConsecutiveWorkingSlot)) {
            result.emplace_back(storedEnumeration.at(i));
        }
    }
    return result;
}

bool Helper6001::CheckMaxConsecutiveDayRuleForCombinationHolder(const std::bitset<RosterPeriodLength>& testPattern,
                                                                const std::bitset<RosterPeriodLength>& breakConsecutiveWorkingSlot) const {

    unsigned char currentConsecutiveDayCounter = _previousConsecutiveDays;
    unsigned int curIdx = 0;
    std::map<unsigned int, unsigned int> exceptionTimes;

    auto CheckConsecutiveDayCount = [&](unsigned char count) {
        if (count <= _defaultMaxConsecutiveDay) return true;
        const auto it = _exceptionConsecutiveDay.lower_bound(count);
        // no find any upper exceptions
        if (it == _exceptionConsecutiveDay.end()) return false;
        // if used exceptions check the current used time
        if (exceptionTimes[it->first] >= it->second) return false;
        // update currently used exception time
        ++exceptionTimes.at(it->first);
        return true;
        };

    for (std::size_t i = 0; i < RosterPeriodLength; ++i) {

        if (!testPattern.test(i) && !breakConsecutiveWorkingSlot.test(i)) {
            // if no RDO assigned
            ++currentConsecutiveDayCounter;
        }
        else {
            // if RDO assigned
            if (currentConsecutiveDayCounter != 0) {
                // check the previous roster period consecutive days
                if (curIdx == 0 && _previousConsecutiveDays != 0) {
                    if (currentConsecutiveDayCounter > _previousRosterPeriodMaxConsecutiveDay) {
                        return false;
                    }
                    if (currentConsecutiveDayCounter > _defaultMaxConsecutiveDay){
                        const auto it = _exceptionConsecutiveDay.lower_bound(currentConsecutiveDayCounter);
                        if (it == _exceptionConsecutiveDay.end()) return false;
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
        if (!CheckConsecutiveDayCount(currentConsecutiveDayCounter + _leadoutConsecutiveDays)) return false;

    return true;
}
