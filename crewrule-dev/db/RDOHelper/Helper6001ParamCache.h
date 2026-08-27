/**
 * @file Helper6001ParamCache.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_HELPER6001PARAMCACHE_H
#define RULEENGINEFRAMEWORK_HELPER6001PARAMCACHE_H

#include <string>
#include <vector>
#include <unordered_set>

struct RDOParamCache{
    long leadIn{};
    long multipleLeadOut{};
    long singleLeadOut{};
    long minLength{};
    bool useDutyRest{false};
    bool countBlankDay{false};
    bool coveredWeekends = true;
    std::string excludingTeams;
    std::string RDOAssignment;
    std::vector<std::string> unassignedAssignments;
    std::map<std::string, int> unassignedPatterns;
    std::string strRestAssignmentGroup;
    std::vector<std::string> restAssignments;
    std::vector<std::string> alAssignments;
    std::vector<std::vector<unsigned char>> acceptRDOs;
    std::vector<std::vector<unsigned char>> exceptRDOs;
    unsigned char previousConsecutiveDays{ 0 };		//prev RP leadin consecutive day count
    unsigned char leadoutConsecutiveDays{ 0 };		//next RP leadout consecutive day count
    unsigned char maxNumRDONeeded{ 0 };				//max(acceptRDONum, exceptRDONum)
    unsigned char minNumRDONeeded{ 28 };				//min(acceptRDONum, exceptRDONum)
    std::vector<int> minSpacingBetweenConsecutiveRDOs;
    bool isExceptRDO = false;
    bool legalPA = true;							//preAssign check
    int maxConsecutiveTimes{};
    int addMaxConsecutiveTimes{};
    int addMaxNumber{};
    int unassignedDays{};
    int maxUANum{};
    long greyDayLeadOut{};
    //6010 params
    static std::unordered_set<std::string> blockAssignments;
    static int blockDayNum;
    static long long blockCheckOut;
    static long long blockCheckIn;
};

#endif //RULEENGINEFRAMEWORK_HELPER6001PARAMCACHE_H
