/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/11/11 16:20
 * @File:    EnumerationDayOffPatternHelperTypeDefine.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERTYPEDEFINE_H
#define RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERTYPEDEFINE_H

#include <vector>
#include <set>
#include <map>
#include <bitset>

template<size_t NumBits>
struct EnumerationDayOffPatternHelperTypeDefine {
    using EnumerationElementType = std::bitset<NumBits>;
    using EnumerationType = std::vector<EnumerationElementType>;
    using CacheType = std::map<std::string, EnumerationType>;
};


#endif //RULEENGINEFRAMEWORK_ENUMERATIONDAYOFFPATTERNHELPERTYPEDEFINE_H
