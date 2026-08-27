/**
 * @file CheckDaysOffFor5JSecondRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#ifndef _CHECKDAYSOFFFOR5JSECONDRULEPARAM_H_
#define _CHECKDAYSOFFFOR5JSECONDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckDaysOffFor5JRule;
class CheckDaysOffFor5JRuleParam;

class CheckDaysOffFor5JSecondRuleParam : public RuleParam {
	friend class CheckDaysOffFor5JRule;
	friend class CheckDaysOffFor5JRuleParam;
private:
	explicit CheckDaysOffFor5JSecondRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7361;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 2;

	enum class ParamLocation {
		UNAVAILABLE_DAYS = 0,
		MIN_DAYS_OFF = 1
	};

	int _rowNum{};

	//符合条件Unavailable Assignment Group和Assignment条件的Unavailable天数，支持范围定义，如 A - B，也就是天数大于等于A并且小于B
	std::string _unavailableDays{};
	int _unavailableDaysStart{};
	int _unavailableDaysEnd{};

	int _minDaysOff{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchAlDays(const int alDay) const;
public:

	int GetMinDaysOffByUnavailableDays(const int unavailableDays) const;
};

#endif //_CHECKDAYSOFFFOR5JSECONDRULEPARAM_H_
