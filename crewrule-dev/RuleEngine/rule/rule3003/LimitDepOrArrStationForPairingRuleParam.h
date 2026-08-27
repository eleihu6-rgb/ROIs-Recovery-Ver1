/**
 * @file LimitDepOrArrStationForPairingRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-19
**/

#ifndef _LIMITDEPORARRSTATIONFORPAIRINGRULEPARAM_H_
#define _LIMITDEPORARRSTATIONFORPAIRINGRULEPARAM_H_

#include "CrewDB.h"
#include "RuleParam.h"
#include <string>
#include "matcher/InExMatchExpression.h"

class LimitDepOrArrStationForPairingRule;

class LimitDepOrArrStationForPairingRuleParam : public RuleParam {
	friend class LimitDepOrArrStationForPairingRule;
private:
    explicit LimitDepOrArrStationForPairingRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 3003;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		PAIRING_ASSIGNMENTS = 1,
		BASES = 2,
		SEVERITY = 3
    };

	//Pairing的assignment列表。多个值使用“|”分隔并支持*通配
	vector<string> _pairingAssignments{};

	//基地列表。多个值使用“|”分隔并支持*通配
	string _bases{};
	SimpleInExMatchExpression _basesMatch;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchPairingAssignments(const Pairing* pairing) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Pairing* pairing) const;

	//检查是否合规
	bool CheckParam(const Pairing* pairing) const;

};

#endif //_LIMITDEPORARRSTATIONFORPAIRINGRULEPARAM_H_
