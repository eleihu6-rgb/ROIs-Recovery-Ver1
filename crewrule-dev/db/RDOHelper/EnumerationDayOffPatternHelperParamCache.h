/**
 * @file EnumerationDayOffPatternHelperParamCache.h
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @date 2025-11-18
**/


#ifndef ENUMERATIONDAYOFFPATTERNHELPERPARAMCACHE_H
#define ENUMERATIONDAYOFFPATTERNHELPERPARAMCACHE_H

#include <string>
#include <vector>
#include <unordered_set>
#include <map>

struct EnumerationDayOffPatternHelperParamCache {
    long leadIn{};
    long leadOut{};
    bool countBlankDay{ false };
    bool coveredWeekends = true;
    std::string excludingTeams;
    std::vector<std::string> DOAssignments;
    std::vector<std::string> DOAssignmentGroups;
    std::vector<std::string> alAssignments;
    std::vector<std::string> alAssignmentGroups;
    std::vector<std::vector<unsigned char>> acceptDOs;
    std::vector<std::vector<unsigned char>> exceptDOs;
    unsigned char maxNumRDONeeded{ 0 };				//max(acceptRDONum, exceptRDONum)
    unsigned char minNumRDONeeded{ 28 };				//min(acceptRDONum, exceptRDONum)
    int minSpacingBetweenConsecutiveDOs;
    bool isExceptDO = false;
    bool legalPA = true;							//preAssign check
    int maxConsecutiveTimes{ 999 };
    long long instanceId = 0;
    unsigned char previousConsecutiveDays{ 0 };
    unsigned char leadoutConsecutiveDays{ 0 };
    std::vector<std::set<unsigned char>> weekendVector{};
    long long ruleId = 0;
    long long ruleParamId = 0;
};

#endif //ENUMERATIONDAYOFFPATTERNHELPERPARAMCACHE_H
