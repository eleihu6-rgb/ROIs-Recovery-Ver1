/**
 * @file LimitLayoverParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITLAYOVERPARAM_H_
#define _LIMITLAYOVERPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class TransitAndLayoverRuleParam;
class LimitTransitAndLayoverRule;

class LimitLayoverParam : public RuleParam {
	friend class TransitAndLayoverRuleParam;
	friend class LimitTransitAndLayoverRule;
private:
    explicit LimitLayoverParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6019;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 3;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		LAYOVER_AIRPORTS = 1,
		SEVERITY = 2
    };

	//任务环基地列表,支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};
	//允许过夜机场列表,支持*通配
	vector<std::string> _layoverAirports{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Duty& duty, const std::string& base) const;

	//检查是否可以进行过夜的机场
	bool CheckLayoverAirports(const Duty& duty) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Duty& duty, const std::string& base) const;

	//检查是否满足参数
	bool CheckParam(const Duty& duty) const;
};

#endif //_LIMITLAYOVERPARAM_H_
