/**
 * @file CheckLayoverRestrictionRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKLAYOVERRESTRICTIONRULEPARAM_H_
#define _CHECKLAYOVERRESTRICTIONRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include <vector>

class CheckLayoverRestrictionRule;

class CheckLayoverRestrictionRuleParam : public RuleParam {
	friend class CheckLayoverRestrictionRule;
private:
	explicit CheckLayoverRestrictionRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7227;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		PAIRING_BASE = 0,
		ASSIGNMENTS = 1,
		AIRLINE_CODE = 2,
		FLIGHT_FLEETS = 3,
		FLIGHT_NUMBERS = 4,
		DEPS = 5,
		ARVS = 6,
		START_DATE = 7,
		END_DATE = 8,
		FORCE_LAYOVER = 9,
		FORCE_NOT_LAYOVER = 10
	};

	//pairing基地
	std::string _pairingBase{};
	//航班任务类型,使用“|”分隔，表示多个值
	std::vector<std::string> _assignments{};
	//航司二字码
	std::string _airlineCode{};
	//航班机型,使用“|”分隔，表示多个值
	std::vector<std::string> _flightFleets{};
	//航班号,使用“|”分隔，表示多个值
	std::vector<std::string> _flightNumbers{};
	//起飞机场,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _deps{};
	//到达机场,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _arvs{};
	std::string _depsRaw{};
	std::string _arvsRaw{};
	//航班开始日期
	std::string _startDate{};
	//航班结束日期
	std::string _endDate{};
	//是否强制layover，Y/N/*，Y表示必须layover，N和*表示不强制或不判断
	std::string _forceLayover;
	//是否强制不layover，Y/N/*，Y表示不允许layover，N和*表示不强制或不判断
	std::string _forceNotLayover;

	struct AirportPattern {
		bool allowAny{ true };
		bool isNegated{ false };
		std::vector<std::string> values{};

		bool Matches(const std::string& airport) const;
	};

	AirportPattern _depsPattern{};
	AirportPattern _arvsPattern{};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);
	void ParseAirportPattern(const std::string& value, std::vector<std::string>& plainValues, std::string& rawValue, AirportPattern& pattern);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchParam(const Segment* segment) const;
	bool MatchDepStation(const std::string& depStation) const;
	bool MatchArvStation(const std::string& arrStation) const;
	bool HasDepConstraint() const;
	bool HasArvConstraint() const;

};

#endif //_CHECKLAYOVERRESTRICTIONRULEPARAM_H_
