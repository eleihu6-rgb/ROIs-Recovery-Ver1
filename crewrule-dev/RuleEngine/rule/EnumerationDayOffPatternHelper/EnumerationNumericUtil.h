/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/11/13 9:45
 * @File:    EnumerationNumericUtil.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef RULEENGINEFRAMEWORK_ENUMERATIONNUMERICUTIL_H
#define RULEENGINEFRAMEWORK_ENUMERATIONNUMERICUTIL_H

#include <map>
#include <vector>
#include <climits>
#include <numeric>

class EnumerationNumericUtil final {
public:
    static uint64_t
    GetEnumerationCount(const std::vector<unsigned char> &desiredPattern, long long rosterPeriodLength) {
        // get the total number of blank day and target blank day for combination sum
        unsigned char blankDay = std::accumulate(desiredPattern.begin(), desiredPattern.end(),
                                                 (unsigned char) rosterPeriodLength, std::minus<>());
        unsigned char targetBlankDayForCombinationSum = blankDay - (unsigned char) desiredPattern.size() + 1;
        uint64_t combinationSumCalCount = GetSingleCombination(
                targetBlankDayForCombinationSum + (unsigned char) desiredPattern.size(),
                (unsigned char) desiredPattern.size());

        std::map<unsigned char, unsigned char> uniqueCount;
        for (const auto &element: desiredPattern) {
            uniqueCount[element] += 1;
        }
        uint64_t patternEnumerationCount = GetFact(desiredPattern.size());
        for (const auto &pair: uniqueCount) {
            patternEnumerationCount /= GetFact(pair.second);
        }
        return combinationSumCalCount * patternEnumerationCount;
    }

    inline static uint64_t GetFact(uint64_t n) { return (n == 1 || n == 0) ? 1 : GetFact(n - 1) * n; };

    static uint64_t GetSingleCombination(unsigned char chooseFrom, unsigned char choose){
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
};

#endif //RULEENGINEFRAMEWORK_ENUMERATIONNUMERICUTIL_H
