/**
 * @file MaxFlightTimeInPeriodForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _MAXFLIGHTTIMEINPERIODFOREVAFDRULEPARAM_H_
#define _MAXFLIGHTTIMEINPERIODFOREVAFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMaxFlightTimeInPeriodForEvaFdRule;
class MaxFlightTimeInPeriodSlideListener;
class BaseActivityPeriod;

class MaxFlightTimeInPeriodForEvaFdRuleParam : public RuleParam {
friend class CheckMaxFlightTimeInPeriodForEvaFdRule;
friend class MaxFlightTimeInPeriodSlideListener;
private:
    explicit MaxFlightTimeInPeriodForEvaFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7205;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
        BASES = 0,
        RANKS = 1,
        FLEETS = 2,
        TEAMS = 3,
        COMPOSITIONS = 4,
        DUTY_ASSIGNMENTS = 5,
        DUTY_TYPE = 6,
        DISCRETION_APPLICABLE = 7,
        SERVICE_TYPE = 8,
        PERIOD = 9,
        UNIT = 10,
        LIMIT_BLH_RANGE = 11,
        LIMIT_FDP_RANGE = 12,
        LIMIT_DP_RANGE = 13,
        SEVERITY = 14
    };

    //所属基地,多个值使用“|”分隔并支持*通配。
    std::vector<std::string> _bases{};
    //人员级别,多个值使用“|”分隔并支持*通配。
    std::vector<std::string> _ranks{};
    //人员机型,多个值使用“|”分隔并支持*通配。
    std::vector<std::string> _fleets{};
    //团队,多个值使用“|”分隔并支持*通配
    std::vector<std::string> _teams{};
    //配比,多个值使用“|”分隔并支持*通配。
    std::vector<std::string> _compositions{};
    //任务类型,多个值使用“|”分隔并支持*通配。
    std::vector<std::string> _dutyAssignments{};
    //Duty的国内国际类型,多个值使用“|”分隔并支持*通配。Duty的国内国际类型，取值：D-国内航班，I-国际航班，R-区域航班
    std::string _strDutyType{};
    std::vector<std::string> _dutyTypes{};
    //时间周期,例如：7
    unsigned int _timePeriod{};
    //时间周期单位,CD-天(日历天，滚动计算）
    std::string _timePeriodUnit{};
    //限制飞时范围（分钟数）,格式：HH:mm-HH:mm
    std::string _limitBLHRange{};
    int _limitBLHMinutesLower{ 0 };
    int _limitBLHMinutesUpper{ 0 };
    //限制FDP范围（分钟数）,格式：HH:mm-HH:mm
    std::string _limitFDPRange{};
    int _limitFDPMinutesLower{ 0 };
    int _limitFDPMinutesUpper{ 0 };
    //限制DP范围（分钟数）,格式：HH:mm-HH:mm
    std::string _limitDPRange{};
    int _limitDPMinutesLower{ 0 };
    int _limitDPMinutesUpper{ 0 };
    //是否适用Discretion,取值：Y/N，*表示忽略或默认为N
    std::string _strDiscretionApplicable{};
    bool _isDiscretionApplicable{ false };
    //航班服务类型，支持|多选和*忽略
    std::string _strServiceType{};
    std::vector<std::string> _serviceTypes{};

    void ParseParam(const std::string& paramString);

    void ParseParam(const DBRule& dbRule);

    //判断机组人员是否满足资质
    bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

    //匹配配比
    bool MatchComposition(const Duty& duty) const;

    //判断Duty是否满足任务类型（计算BLH的任务类型）
    bool MatchDutyAssignments(const Duty& duty) const;

    //匹配Duty的国内国际类型
    bool MatchDutyTypes(const string& intDomType) const;

    //匹配航班服务类型
    bool MatchServiceType(const std::set<string>& flightServiceTypes) const;

private:

    bool MatchDutyRule(const Duty& duty) const;
	
    bool MatchActivityPeriodRule(const shared_ptr<BaseActivityPeriod>& activityPeriod) const;

public:
    enum class WarnCode {
        NO_WARN = 0, //无告警
        BLH_WARN = 1, //BLH仍然不满足后告警
        FDP_WARN = 2, //FDP不满足后告警
        DP_WARN = 4 //DP不满足后告警
    };

    struct CumulativeDuration {
        int cumulativeBLHMinutes = 0; //累计飞时（FT, 也称 BLH)（分钟数）
        int cumulativeFDPMinutes = 0; //累计FDP（分钟数）
        int cumulativeDPMinutes = 0; //累计DP（分钟数）

        int cumulativeBLHDiscretion = 0; //累计飞时 Discretion（FT, 也称 BLH)（分钟数）
        int cumulativeFDPDiscretion = 0; //累计FDP Discretion（分钟数）
        int cumulativeDPDiscretion = 0; //累计DP Discretion（分钟数）

		set<string> flightServiceTypes; //累计的航班服务类型
    };

    int CheckParam(const MaxFlightTimeInPeriodForEvaFdRuleParam::CumulativeDuration& cumulativeDuration) const;

};

#endif //_MAXFLIGHTTIMEINPERIODFOREVAFDRULEPARAM_H_
