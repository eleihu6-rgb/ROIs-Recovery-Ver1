/**
 * @file CheckMinNumberOfDaysOffPatternForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#ifndef _CheckMinNumberOfDaysOffPatternForPRRuleParam_H_
#define _CheckMinNumberOfDaysOffPatternForPRRuleParam_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class CheckMinNumberOfDaysOffForPRRule;
class CheckMinNumberOfDaysOffForPRRuleParam;

class CheckMinNumberOfDaysOffPatternForPRRuleParam : public RuleParam {
	friend class CheckMinNumberOfDaysOffForPRRule;
	friend class CheckMinNumberOfDaysOffForPRRuleParam;
private:
	explicit CheckMinNumberOfDaysOffPatternForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7325;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 4;

	enum class ParamLocation {
		LEAVE_DAYS = 0,
		PREFERRED_DO_PATTERNS = 1,
		EXCEPTIONAL_DP_PATTERNS = 2,
		SEVERITY = 3
	};

	int _rowNum{};

	//符合条件Leave Assignment Group和Assignment条件的Leave天数，支持范围定义，如 A - B，也就是休假天数大于等于A并且小于B
	std::string _leaveDays{};
	int _leaveDaysStart{};
	int _leaveDaysEnd{};

	//偏好的DO分配模式，支持|分开多个模式。格式为2+2+2+2|3+1+3+1，注意+前后需要匹配顺序，3311是不符合3131的顺序定义。DO总天数通过Pattern中计算
	std::vector<std::string> _preferredDoPattern{};

	//当偏好模式无法满足，允许例外的分配模式，例外模式只支持预占违规时的分配。
	std::vector<std::string> _exceptionalDoPattern{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchAlDays(const int alDay) const;
public:

};

#endif //_CheckMinNumberOfDaysOffPatternForPRRuleParam_H_
