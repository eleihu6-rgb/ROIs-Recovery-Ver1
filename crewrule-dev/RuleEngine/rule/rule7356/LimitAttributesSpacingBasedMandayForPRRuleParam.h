/**
 * @file LimitAttributesSpacingBasedMandayForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#ifndef _LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULEPARAM_H_
#define _LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class LimitAttributesSpacingBasedMandayForPRRule;

class LimitAttributesSpacingBasedMandayForPRRuleParam : public RuleParam {
	friend class LimitAttributesSpacingBasedMandayForPRRule;
private:
    explicit LimitAttributesSpacingBasedMandayForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7356;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 9;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ATTRIBUTES_A = 5,
		ATTRIBUTES_B = 6,
		MIN_PERIOD = 7,
		UNIT = 8,
		SEVERITY = 9
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Pairing标签A列表。多个值使用“|”分隔并支持*通配。
	vector<string> _attributesA{};

	//Pairing标签B列表。多个值使用“|”分隔并支持*通配。
	vector<string> _attributesB{};

	//最小间隔。标签A列表和标签B列表之间最小间隔，单位为Unit。并且标签A列表和标签B列表是有顺序的，标签A列表在前面，标签B在后面。
	int _minPeriod{};

	//间隔时间单位。取值：RH小时、CD日历天，CW日历周、CM日历月、CY日历年
	std::string _periodUnit{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

	bool MatchAttributesA(const std::shared_ptr<CREW_MANDAY_BASIC>& manday) const;

	bool MatchAttributesB(const std::shared_ptr<CREW_MANDAY_BASIC>& manday) const;
};

#endif //_LIMITATTRIBUTESSPACINGBASEDMANDAYFORPRRULEPARAM_H_
