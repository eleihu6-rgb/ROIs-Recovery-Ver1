/**
 * @file legacyDefine.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_LEGACYDEFINE_H
#define RULEENGINEFRAMEWORK_LEGACYDEFINE_H

#include <vector>
#include <string>
#include <map>
#include "CrewDB.h"
#include "RuleComposition.h"
#include "RuleLegality.h"
#include "SwapCrew.h"
#include "SwapData.h"

/*
#define     RULE_PHASE_ALL     0
#define     RULE_PHASE_PLAN    1
#define     RULE_PHASE_ASSIGN  2
#define     RULE_PHASE_TRACK   3
*/
enum PHASE{
    PHASE_ALL = 0,
    PHASE_PLANNING = 1,
    PHASE_ASSIGNMENT = 2,
    PHASE_TRACKING = 3
};



//针对swap操作checkRules参数

struct WORKDUTY_TIMES
{
    time_t startUtcTime = -1;
    time_t endUtcTime = -1;
    time_t startLocTime = -1;
    time_t endLocTime = -1;
    bool needRuleCheck = false;
    std::string dutyType;
    int rosterIndex = -1;
    int savedValue = 0;
    Activity* activity = nullptr;
    string assignment;
};

struct REST_TIME
{
    time_t startUtcTime = -1;//休息开始时间(UTC)
    time_t endUtcTime = -1;//休息结束时间(UTC)
    int restMinutes = 0;//休息分钟数

    REST_TIME() {};

    REST_TIME(const time_t startUtcTime, const time_t endUtcTime) {
        this->startUtcTime = startUtcTime;
        this->endUtcTime = endUtcTime;
        this->restMinutes = static_cast<int>(endUtcTime - startUtcTime) / 60;
    }

    REST_TIME(const time_t startUtcTime, const time_t endUtcTime, const int restMinutes) {
        this->startUtcTime = startUtcTime;
        this->endUtcTime = endUtcTime;
        this->restMinutes = restMinutes;
    }

    //获得最大休息值
    static REST_TIME GetMax(const REST_TIME& restA, const REST_TIME& restB) {
        if (restA.restMinutes >= restB.restMinutes) {
            return restA;
        }
        else {
            return restB;
        }
    }
};

struct DUMMY_DAYS
{
    int dummyDays = -1;
    int dummyFt = -1;
};

#endif //RULEENGINEFRAMEWORK_LEGACYDEFINE_H
