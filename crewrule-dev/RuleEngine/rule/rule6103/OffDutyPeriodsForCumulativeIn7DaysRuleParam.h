/**
 * @file OffDutyPeriodsForCumulativeIn7DaysRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULEPARAM_H_
#define _OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class OffDutyPeriodsForCumulativeIn7DaysRule;

class OffDutyPeriodsForCumulativeIn7DaysRuleParam : public RuleParam {
friend class OffDutyPeriodsForCumulativeIn7DaysRule;
private:
    explicit OffDutyPeriodsForCumulativeIn7DaysRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6103;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 15;

    enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TIME_PERIOD = 3,
		MIN_REST = 4,
		MIN_LOCAL_NIGHT = 5,
		TIME_PERIOD_UNIT = 6,
		ASSIGNMENT_GROUPS = 7,
		ASSIGNMENT_LEVEL = 8,
		CHECK_PERIOD_BY_START_OR_END = 9,
		DO_ASSIGNMENT_GROUPS = 10,
		UTILIZE_POST_DUTY_REST = 11,
		COUNT_BLANK_DAY = 12,
		ULTILIZE_LAYOVER = 13,
		SEVERITY = 14
    };

	//所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//时间周期
	unsigned int _timePeriod{};
	//最小休息时长（小时）
	unsigned int _minRest{};
	//最小本地夜晚天数（天）
	unsigned int _minLocalNight{};
	//时间周期单位,RH-小时，CD-天
	std::string _timePeriodUnit{};
	//任务组,定义的任务，FLY飞行/SBY备份
	std::vector<std::string> _assignmentGroups{};
	//任务层级,任务层级，P任务环/D任务
	std::string _assignmentLevel{};
	//从任务的开始检查还是结束检查,S开始/E结束
	std::string _checkPeriodStartOrEnd{"E"};
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

	//判断Duty是否满足任务组
	bool MatchAssignmentGroups(const string& assignment, const std::shared_ptr<CrewDataContext>& dbData) const;

};

#endif //_OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULEPARAM_H_
