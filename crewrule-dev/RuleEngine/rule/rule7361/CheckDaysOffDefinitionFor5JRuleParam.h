/**
 * @file CheckDaysOffDefinitionFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#ifndef _CHECKDAYSOFFDEFINITIONFOR5JRULEPARAM_H_
#define _CHECKDAYSOFFDEFINITIONFOR5JRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"
#include "period/RestPeriod.h"

class CheckDaysOffFor5JRule;
class CheckDaysOffFor5JRuleParam;

class CheckDaysOffDefinitionFor5JRuleParam : public RuleParam {
	friend class CheckDaysOffFor5JRule;
	friend class CheckDaysOffFor5JRuleParam;
private:
	explicit CheckDaysOffDefinitionFor5JRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7361;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 15;

	enum class ParamLocation {
		UNAVAILABLE_ASSIGNMENT_GROUPS = 1,
		UNAVAILABLE_ASSIGNMENTS = 2,
		HOME_BASE = 4,
		INCLUDE_BLANK_DAY = 5,
		INCLUDE_LAYOVER_REST = 6,
		INCLUDE_PAIRING_BASE_REST = 7,
		DAYS_OFF_ASSIGNMENT_GROUPS = 8,
		DAYS_OFF_ASSIGNMENTS = 9,
		CHECK_PERIOD = 10,
		CHECK_MODE = 11
	};

	int _rowNum{};

	//Unavailable的Assignment Groups列表。多个值使用”|”分隔并支持*通配
	std::vector<string> _unavailableAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _unavailableAssignmentGroupsMatch;

	//Unavailable的Assignments列表。多个值使用”|”分隔并支持*通配
	std::vector<string> _unavailableAssignments{};
	AssignmentMatchExpression<Activity> _unavailableAssignmentsMatch;

	//Y/N，是否需要必须在基地休息，* 为任意地点。
	std::string _homeBase{};

	//Y/N，是否包括空白天
	std::string _includeBlankDay{};

	//Y/N，是否包括Layover Rest
	std::string _includeLayoverRest{};

	//Y/N，是否包括Pairing在基地的Rest
	std::string _includePairingBaseRest{};

	//Days Off的Assignment Groups列表。多个值使用”|”分隔并支持*通配
	std::vector<string> _daysOffAssignmentGroups{};
	AssignmentGroupMatchExpression<Activity> _daysOffAssignmentGroupsMatch;

	//Days Off的Assignments列表。多个值使用”|”分隔并支持*通配
	std::vector<string> _daysOffAssignments{};
	AssignmentMatchExpression<Activity> _daysOffAssignmentsMatch;

	//检查周期数量，如1, 2, 14等
	int _checkPeriod{};

	//检查模式：CW-日历周, CM-日历月, RD-滚动天
	std::string _checkMode{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

public:

	bool MatchDoAssignment(const Activity* activity) const;

	bool MatchDaysOff(const time_t restStart, const time_t restEnd) const;

	int GetUnavailableDaysByRosters(const std::vector<const ROSTER*> rosters, const time_t start, const time_t end, const std::shared_ptr<CrewDataContext>& dbData) const;
};

#endif //_CHECKDAYSOFFDEFINITIONFOR5JRULEPARAM_H_
