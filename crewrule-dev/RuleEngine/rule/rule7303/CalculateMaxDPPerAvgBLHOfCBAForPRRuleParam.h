/**
 * @file CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-27
**/

#ifndef _CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULEPARAM_H_
#define _CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMaxDPPerAvgBLHOfCBAForPRRule;

class CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam : public RuleParam {
friend class CalculateMaxDPPerAvgBLHOfCBAForPRRule;
private:
    explicit CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7303;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		BASES = 1,
		FLEETS = 2,
		DUTY_TYPES = 3,
		AVG_BLH_RANGE = 4,
		TOTAL_BLH_RANGE = 5,
		MAX_DP = 6,
		SEVERITY = 7
    };

	//Pairing基地列表。多个值使用“|”分隔并支持*通配
	vector<string> _pairingBases{};

	//Duty内机型列表。多个值使用“|”分隔并支持*通配。Duty内所有FLY航班机型都要符合该设置值。
	vector<string> _dutyFleets{};

	//Duty的DIR(国内和国际)类型列表。取值：D - 国内，I - 国际，R - 区域。多个值使用“|”分隔并支持*通配。
	vector<string> _dutyTypes{};

	//Duty内部FLY航班的平均飞时区间。格式：HH:mm-HH:mm取值范围:[HH:mm,HH:mm)
	std::string _avgBLHRange{};
	int _avgBLHRangeMinutesLower{};
	int _avgBLHRangeMinutesUpper{INT_MAX};

	//Duty内部FLY航班的总飞时区间。格式：HH:mm-HH:mm取值范围:[HH:mm,HH:mm)
	std::string _totalBLHRange{};
	int _totalBLHRangeMinutesLower{};
	int _totalBLHRangeMinutesUpper{INT_MAX};

	//最大DP(分钟)。格式：HH:mm
	int _maxDP{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

private:

	//判断是否满足所在基地条件
	bool MatchPairingBase(const Duty& duty, const std::string& base) const;

	//判断Duty的机型。Duty内所有FLY航班机型都要符合该设置值。
	bool MatchDutyFleets(const Duty& duty) const;

	//判断Duty的国内和国际类型是否满足
	bool MatchDutyTypes(const Duty& duty) const;

	//判断Duty平均飞时和总飞时是否满足
	bool MatchAvgAndTotalBLHRange(const Duty& duty) const;

public:
	bool MatchParam(const Duty& duty, const std::string& base) const;

};

#endif //_CALCULATEMAXDPPERAVGBLHOFCBAFORPRRULEPARAM_H_
