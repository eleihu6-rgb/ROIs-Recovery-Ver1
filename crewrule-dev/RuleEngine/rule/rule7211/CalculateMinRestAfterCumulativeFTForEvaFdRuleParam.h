/**
 * @file CalculateMinRestAfterCumulativeFTForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULEPARAM_H_
#define _CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestAfterCumulativeFTForEvaFdRule;

class CalculateMinRestAfterCumulativeFTForEvaFdRuleParam : public RuleParam {
friend class CalculateMinRestAfterCumulativeFTForEvaFdRule;
private:
    explicit CalculateMinRestAfterCumulativeFTForEvaFdRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7211;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
        BASES = 0,
        RANKS = 1,
        FLEETS = 2,
        TEAMS = 3,
        COMPOSITIONS = 4,
        DUTY_ASSIGNMENTS = 5,
        DUTY_TYPE = 6,
        CONSECUTIVE_HOURS = 7,
        CUMULATIVE_MAX_BLH = 8,
        MIN_REST = 9,
        SEVERITY = 10
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
    //Duty的国内国际类型,多个值使用“|”分隔并支持*通配。Duty的国内国际类型，取值：D-国内航班，I-国际航班，R-区域航班
    vector<std::string> _dutyTypes{};

    //连续小时数,格式：HH:mm
    std::string _strConsecutiveHours{};
    int _consecutiveHoursMinutes{};
    //累计最大飞行时间BLH（分钟数）,格式：HH:mm
    std::string _strCumulativeMaxFT{};
    int _cumulativeMaxFTMinutes{};
    
    //最小休息时长（分钟数）,格式：HH:mm
    std::string _strMinRest{};
    int _minRestMinutes{};


    void ParseParam(const std::string& paramString);

    void ParseParam(const DBRule& dbRule);

    //判断机组人员是否满足资质
    bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

    //匹配配比
    bool MatchComposition(const Duty& duty) const;

    //判断Duty是否满足任务类型（计算BLH的任务类型）
    bool MatchDutyAssignments(const Duty& duty) const;

    //匹配Duty的国内国际类型
    bool MatchDutyTypes(const Duty& duty) const;
    
    bool MatchRule(const Duty& duty) const;

};

#endif //_CALCULATEMINRESTAFTERCUMULATIVEFTFOREVAFDRULEPARAM_H_
