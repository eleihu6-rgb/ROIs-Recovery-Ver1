/**
 * @file OffDutyPeriodsForCumulativeIn28DaysRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULEPARAM_H_
#define _OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class OffDutyPeriodsForCumulativeIn28DaysRule;

class OffDutyPeriodsForCumulativeIn28DaysRuleParam : public RuleParam {
friend class OffDutyPeriodsForCumulativeIn28DaysRule;
private:
    explicit OffDutyPeriodsForCumulativeIn28DaysRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6104;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TIME_PERIOD = 3,
		MIN_DAY_OFF = 4,
		TIME_PERIOD_UNIT = 5,
		ASSIGNMENT_GROUPS = 6,
		ASSIGNMENT_LEVEL = 7,
		CHECK_PERIOD_BY_START_OR_END = 8,
		DO_ASSIGNMENT_GROUPS = 9,
		UTILIZE_POST_DUTY_REST = 10,
		COUNT_BLANK_DAY = 11,
		ULTILIZE_LAYOVER = 12,
		SEVERITY = 13
    };

	//所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//时间周期
	unsigned int _timePeriod{};
	//最小休息天数
	unsigned int _minDayOff{};
	//时间周期单位,RH-小时，CD-天
	std::string _timePeriodUnit{};
	//任务组,定义的任务，FLY飞行/SBY备份
	std::vector<std::string> _assignmentGroups{};
	//任务层级,任务层级，P任务环/D任务
	std::string _assignmentLevel{};
	//从任务的开始检查还是结束检查,S开始/E结束
	std::string _checkPeriodStartOrEnd{};
	//休息日类任务所属任务组，即：计入休息的任务组
	std::vector<std::string> _dayOffAssignmentGroups{};
	//航后休息是否计入休息
	bool _isUtilizePostDutyRest{true};
	//空白天是否计入休息
	bool _isCountBlankDay{true};
	//过夜是否计入休息（过夜是指Duty之间休息时长）
	bool _isUltilizeLayover{true};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

};

#endif //_OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULEPARAM_H_
