/**
 * @file CheckMinSpaceBetweenDutyForRPRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKMINSPACEBETWEENDUTYFORRPRULEPARAM_H_
#define _CHECKMINSPACEBETWEENDUTYFORRPRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMinSpaceBetweenDutyForRPRule;
class WorkPeriod;
class Period;

class CheckMinSpaceBetweenDutyForRPRuleParam : public RuleParam {
	friend class CheckMinSpaceBetweenDutyForRPRule;
private:
	explicit CheckMinSpaceBetweenDutyForRPRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7323;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 0,
		RANKS = 1,
		FLEETS = 2,
		TEAMS = 3,
		PREV_DUTY_ASSIGNMENT_GROUPS = 4,
		NEXT_DUTY_ASSIGNMENT_GROUPS = 5,
		PREV_DUTY_ASSIGNMENTS = 6,
		NEXT_DUTY_ASSIGNMENTS = 7,
		PREV_DUTY_TIME_RANGE = 8,
		NEXT_DUTY_TIME_RANGE = 9,
		MIN_REST_PERIOD = 10,
		REST_UNIT = 11
	};

	//Crew的基地列表，支持|分开多个设置和*通配符
	std::vector<std::string> _bases{};
	//Crew的Rank列表，支持|分开多个设置和*通配符
	std::vector<std::string> _ranks{};
	//Crew的Fleet列表，支持|分开多个设置和*通配符
	std::vector<std::string> _fleets{};
	//Crew的Team列表，支持|分开多个设置和*通配符
	std::vector<std::string> _teams{};
	//前个任务Duty的Assignment Group列表，支持|分开多个设置和*通配符
	std::vector<std::string> _prevDutyAssignmentGroups{};
	//后面任务Assignment Group列表，支持|分开多个设置和*通配符
	std::vector<std::string> _nextDutyAssignmentGroups{};
	//前个任务Duty的Assignment 列表，支持|分开多个设置和*通配符
	std::vector<std::string> _prevDutyAssignments{};
	//后面任务Assignment列表，支持|分开多个设置和*通配符 
	std::vector<std::string> _nextDutyAssignments{};

	//前一个任务的签出时间Check - Out或Duty结束时间在该范围内，格式HH:MM - HH : MM
	std::string _prevDutyTimeRange{};
	int _prevDutyTimeRangeStart{};
	int _prevDutyTimeRangeEnd{};

	//后一个任务的签到时间Check-In或Duty开始时间在该范围内，格式HH:MM - HH:MM
	std::string _nextDutyTimeRange{};
	int _nextDutyTimeRangeStart{};
	int _nextDutyTimeRangeEnd{};

	int _minRestPeriod{};
	//时间单位，支持小时RH、日历天CD
	std::string _restUnit{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchRuleParam(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod) const;
	bool MatchRuleParam(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const;

	bool MatchAssignment(const WorkPeriod* currentWokrPeriod, const WorkPeriod* nextWorkPeriod) const;
	bool MatchAssignment(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const;

	bool MatchTimeRange(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod) const;
	bool MatchTimeRange(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const;

	bool CheckMinRest(const time_t restStartTime, const time_t restEndTime) const;

	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
};

#endif //_CHECKMINSPACEBETWEENDUTYFORRPRULEPARAM_H_
