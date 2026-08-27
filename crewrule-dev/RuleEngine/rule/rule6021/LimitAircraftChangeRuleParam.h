/**
 * @file LimitAircraftChangeRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITAIRCRAFTCHANGERULEPARAM_H_
#define _LIMITAIRCRAFTCHANGERULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitAircraftChangeRule;

class LimitAircraftChangeRuleParam : public RuleParam {
	friend class LimitAircraftChangeRule;
private:
    explicit LimitAircraftChangeRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6021;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		TRANSIT_AIRPORTS = 1,
		AC_CHG_ALLOWED = 2,
		SEVERITY = 3
    };

	//任务环基地列表,支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};
	//允许长中转机场列表,支持*通配
	std::string _strTransitAirports{};
	vector<std::string> _transitAirports{};
	//长中转是否允许换飞机（Y/N）,Y/N
	std::string _strAcChgAllowed{};
	std::shared_ptr<bool> _acChgAllowed{nullptr};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Segment& segment, const std::string& base) const;

	//检查是否可以进行中转的机场
	bool MatchTransitAirports(const Segment& segment) const;

	//检查长中转是否允许换飞机
	bool CheckAcChgAllowed(const Segment& currSegment, const Segment& nextSegment) const;

public:
	enum class WarnCode {
		NO_WARN = 0, //无告警
		AC_CHG_WARN = 1 //更换飞机不满足告警
	};

	//匹配是否满足参数
	bool MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const;

	//检查是否满足参数
	WarnCode CheckParam(const Segment& currSegment, const Segment& nextSegment) const;

};

#endif //_LIMITAIRCRAFTCHANGERULEPARAM_H_
