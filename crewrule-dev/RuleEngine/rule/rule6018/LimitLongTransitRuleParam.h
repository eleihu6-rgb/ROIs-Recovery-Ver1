/**
 * @file LimitLongTransitRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITLONGTRANSITRULEPARAM_H_
#define _LIMITLONGTRANSITRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitLongTransitRule;

class LimitLongTransitRuleParam : public RuleParam {
	friend class LimitLongTransitRule;
private:
    explicit LimitLongTransitRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6018;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		LONG_TRANSIT_AIRPORTS = 1,
		SEVERITY = 2
    };

	//任务环基地列表,支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};
	//允许长中转机场列表,支持*通配
	vector<std::string> _longTransitAirports{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Segment& segment, const std::string& base) const;

	//检查是否可以进行中转的机场
	bool CheckLongTransitAirports(const Segment& segment) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const;

	//检查是否满足参数
	bool CheckParam(const Segment& segment) const;
};

#endif //_LIMITLONGTRANSITRULEPARAM_H_
