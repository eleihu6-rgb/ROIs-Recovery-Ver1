/**
 * @file CalculateMaxDPByComplementForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CalculateMaxDPByComplementForPRRulePARAM_H_
#define _CalculateMaxDPByComplementForPRRulePARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMaxDPByComplementForPRRule;

class CalculateMaxDPByComplementForPRRuleParam : public RuleParam {
	friend class CalculateMaxDPByComplementForPRRule;
private:
	explicit CalculateMaxDPByComplementForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7313;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		COMPOSITIONS = 1,
		REF_COMPOSITION = 2,
		ADDITIONAL_CREWS = 3,
		FLEETS = 4,
		FLIGHTS = 5,
		DEPS = 6,
		ARVS = 7,
		MAX_DP = 8
	};

	//任务的配比，支持*和|分开多个设置
	std::vector<std::string> _compositions{};

	//Duty最小配比列表，支持*设置
	std::string _refComposition{};

	//在配比基础上额外FLY机组数量，可以为0。计算Compositions在Ref Compostion基础上额外配备FLY的Crew数量。如果和该参数设置相等，则检查ACT DP是否在Max限制之内。注：如果应用为PO，该两个参数设置不为*时，忽略该行设置。
	std::string _additionalCrews{};

	//机型，支持*和|分开多个设置，Duty多个FLY航班机型必须都属于该设置之一。
	std::vector<std::string> _fleets{};

	//航班号列表，支持*和|分开多个设置
	std::vector<std::string> _flights{};

	//Duty起飞机场列表，支持*和|分开多个设置
	std::vector<std::string> _deps{};

	//DUTY到达机场列表，支持*和|分开多个设置
	std::vector<std::string> _arrs{};

	//最大DP限制
	int _maxDP{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchRule(Duty* duty, const int minComposition, const int dutyComposition) const;

	bool MatchCompositions(Duty* duty) const;

	bool MatchRefComposition(Duty* duty, const int minComposition, const int dutyComposition) const;

	bool MatchFleets(const Duty* duty) const;

	bool MatchFlightNumbers(const Duty* duty) const;

	bool MatchAirports(const Duty* duty) const;
};

#endif //_CalculateMaxDPByComplementForPRRulePARAM_H_
