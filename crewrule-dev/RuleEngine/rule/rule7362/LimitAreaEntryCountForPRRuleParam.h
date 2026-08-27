/**
 * @file LimitAreaEntryCountForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-11
**/

#ifndef _LIMITAREAENTRYCOUNTFORPRRULEPARAM_H_
#define _LIMITAREAENTRYCOUNTFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "matcher/AssignmentGroupMatchExpression.h"
#include "matcher/AssignmentMatchExpression.h"

class LimitAreaEntryCountForPRRule;

class LimitAreaEntryCountForPRRuleParam : public RuleParam {
	friend class LimitAreaEntryCountForPRRule;
private:
    explicit LimitAreaEntryCountForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7362;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 4;

    enum class ParamLocation {
		PAIRING_BASES = 1,
		AIRPORT_AREA, 
		CHECK_MODE,
		ENTRY_TIMES,
		SEVERITY
    };

	//Pairing基地列表，支持 | 分开多个基地和 * 通配符
	vector<std::string> _pairingBases{};

	//根据机场列表定义区域，支持 | 分开多个机场
    string _strAirportAreas{};
	vector<std::string> _airportAreas{};

	//检查层级,支持*忽略该参数.取值：D/P；D - Duty内部只允许进入区域次数；P - Pairing内部允许进入区域次数（默认值与*等价)
	string _checkMode;

	//进入Airport Area区域次数(连续进入认为是1次)
	int _entryTimes{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);


public:

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const std::string& base) const;
};

#endif //_LIMITAREAENTRYCOUNTFORPRRULEPARAM_H_
