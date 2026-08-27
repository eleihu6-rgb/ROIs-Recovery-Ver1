#pragma once
/**
 * @file CheckNightRestPeriodForEvaRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#ifndef _CHECKNIGHTRESTPERIODFOREVARULEPARAM_H_
#define _CHECKNIGHTRESTPERIODFOREVARULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckNightRestPeriodForEvaRuleParam;

class CheckNightRestPeriodForEvaRuleParam : public RuleParam {
    friend class CheckNightRestPeriodForEvaRule;
private:
    explicit CheckNightRestPeriodForEvaRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7213;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
       BASES = 0,
       RANKS = 1,
       FLEETS = 2,
       TEAMS = 3,
       COMPOSITIONS = 4,
       DUTY_ASSIGNMENTS = 5,
       NIGHT_START = 6,
       NIGHT_END = 7,
       CHECK_TYPE = 8,
       TYPE_VALUE = 9,
       MIN_REST_BEFORE = 10,
       SLEEP_CYCLE_START = 11,
       SLEEP_CYCLE_END = 12,
       MIN_SLEEP_CYCLES = 14
    };


    //所属基地,使用“|”分隔，表示多个值
    vector<std::string> _bases{};
    //人员级别,使用“|”分隔，表示多个值
    vector<std::string> _ranks{};
    //人员机型,使用“|”分隔，表示多个值
    vector<std::string> _fleets{};
    //团队,多个值使用“|”分隔并支持*通配
    vector<std::string> _teams{};
    //机组人员配比方案,多个值使用“|”分隔并支持*通配。
    vector<std::string> _compositions{};
    //任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
    vector<std::string> _dutyAssignments{};
    //夜间范围开始 hh:mm->minutes
    int _nightStart{};
    //夜间范围结束 hh:mm->minutes
    int _nightEnd{};
    //检查类型 BLH/FDP
    std::string _checkType{};
    //检查值 hh:mm->minutes
    int _typeValue{};
    //Duty前最小休息时间
    int _minRestBefore{};
    //Sleep Cycle开始 hh:mm->minutes
    int _sleepCycleStart{};
    //Sleep Cycle结束 hh:mm->minutes
    int _sleepCycleEnd{};
    //最小Sleep Cycle数量
    int _minSleepCycles{};


    void ParseParam(const DBRule& dbRule);

    //判断机组人员是否满足资质
    bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

    //匹配夜间任务
    bool MatchNightDuty(Duty* duty) const;

    //匹配配比
    bool MatchComposition(Duty* duty) const;

    //判断Duty是否满足任务类型（计算BLH的任务类型）
    bool MatchDutyAssignments(Duty* duty) const;

    //匹配检查类型 BLH/FDP
    bool MatchCheckType(Duty* duty) const;

    bool MatchRule(Duty* duty) const;

    bool CheckMinRestBefore(const time_t startTimeLoc, const time_t endTimeLoc) const;

    bool CheckSleepCycles(const time_t startTimeLoc, const time_t endTimeLoc) const;

    //获取Sleep Cycle数量
    int GetSleepCycleNum(const time_t start, const time_t end) const;

};

#endif //_CHECKNIGHTRESTPERIODFOREVARULEPARAM_H_
