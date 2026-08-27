/**
 * @file LimitFlightDHDRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITFLIGHTDHDRULEPARAM_H_
#define _LIMITFLIGHTDHDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class LimitFlightDHDRule;

class LimitFlightDHDRuleParam : public RuleParam {
	friend class LimitFlightDHDRule;
private:
    explicit LimitFlightDHDRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6037;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		FLIGHT_AIRLINE = 1,
		FLIGHT_NUMBER = 2,
		INTERNATIONAL_DOMESTIC = 3,
		ALLOW_USED_AS_DHD = 4,
		SEVERITY = 5
    };


	//任务环基地列表,多个值使用“|”分隔并支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};
	//Segment航司,多个值使用“|”分隔并支持*通配。
	std::string _strFlightAirlines{};
	vector<std::string> _flightAirlines{};

	//Segment航班号,多个值使用“|”分隔并支持*通配
	std::string _strFlightNumbers{};
	vector<std::string> _flightNumbers{};
	
	//Segment国际国内状态,多个值使用“|”分隔并支持*通配。Duty的国内国际类型，取值：D-国内航班，I-国际航班，R-区域航班
	std::string _strDomIntTypes{};
	vector<std::string> _domIntTypes{};

	//是否允许为DHD,对DHD进行筛选后，并设定DHD可用状态
	bool _isAllowUsedDHD{true};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Segment& segment, const std::string& base) const;

	//判断是否满足航班航司条件
	bool MatchFlightAirlines(const Segment& segment) const;

	//判断是否满足航班号条件
	bool MatchFlightNumbers(const Segment& segment) const;

	//判断是否满足航班的国内和国际类型
	bool MatchFlightDomIntType(const Segment& segment) const;

	//检查不允许航班置位DHD
	bool CheckNotAllowedDHD(const Segment& segment) const;

public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		NOT_ALLOWED_DHD = 1, //不允许航班DHD
		MUST_DHD = 2 //航班必须DHD（目前无此场景）
	};

	//匹配是否满足参数
	bool MatchParam(const Segment& segment, const std::string& base) const;

	//检查是否满足参数
	int CheckParam(const Segment& segment) const;
};

#endif //_LIMITFLIGHTDHDRULEPARAM_H_
