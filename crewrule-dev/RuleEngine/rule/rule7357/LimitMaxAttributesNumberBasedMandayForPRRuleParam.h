/**
 * @file LimitMaxAttributesNumberBasedMandayForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#ifndef _LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULEPARAM_H_
#define _LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>

class LimitMaxAttributesNumberBasedMandayForPRRule;

class LimitMaxAttributesNumberBasedMandayForPRRuleParam : public RuleParam {
	friend class LimitMaxAttributesNumberBasedMandayForPRRule;
private:
    explicit LimitMaxAttributesNumberBasedMandayForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7357;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		ATTRIBUTE_LIST = 5,
		UNIQUE_DAY_ATTRIBUTE = 6,
		PERIOD = 7,
		UNIT = 8,
		MAX_ATTRIBUTES = 9,
		SEVERITY = 10
    };

	//所属基地,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _bases{};

	//人员级别,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _ranks{};

	//人员机型,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _fleets{};

	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//标签列表。多个值使用“|”分隔并支持*通配
	string _strAttributes;
	std::vector<std::string> _attributes{};

	//Pairing标签B列表。取值：Y/N或*。 Y - Crew在一天内符合条件标签数量最多计为1 （或者0）；N - 标签维度唯一；* - 有几个标签算几个。
	std::shared_ptr<bool> _uniqueDayAttribute{nullptr};

	//周期。单位来自Unit
	int _period{};

	//时间单位。取值：RH小时、CD日历天，CW日历周、CM日历月、CY日历年
	std::string _periodUnit{};

	//Crew符合Attributes List的最大次数。
	int _maxAttributesNum{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

public:

};

#endif //_LIMITMAXATTRIBUTESNUMBERBASEDMANDAYFORPRRULEPARAM_H_
