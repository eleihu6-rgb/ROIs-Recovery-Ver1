/**
 * @file ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _REDUCEOFFDUTYPERIODAWAYFROMBASERULEFIRSTCASEPARAM_H_
#define _REDUCEOFFDUTYPERIODAWAYFROMBASERULEFIRSTCASEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class ReduceOffDutyPeriodAwayFromBaseRule;
class ReduceOffDutyPeriodAwayFromBaseRuleParam;

class ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam : public RuleParam {
	friend class ReduceOffDutyPeriodAwayFromBaseRule;
	friend class ReduceOffDutyPeriodAwayFromBaseRuleParam;
private:
    explicit ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6102;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 8;

    enum class ParamLocation {
		FIRST_ODP_MINIMUM = 0,
		FIRST_FDP_MAXIMUM = 1,
		SECOND_ODP_MINIMUM = 2,
		SECOND_ODP_ACC_STATE = 3,
		SECOND_FDP_MAXIMUM = 4,
		THIRD_ODP_MINIMUM = 5,
		SECOND_ODP_REDUCED_TO_MINIMUM = 6,
		SEVERITY = 7
    };

	//第一个ODP最小值,格式：HH:mm
	std::string _firstODPMin{};
	int _firstODPMinMinutes{ 0 };
	//第一个FDP最大值,格式：HH:mm
	std::string _firstFDPMax{};
	int _firstFDPMaxMinutes{ 0 };
	//第二个ODP最小值,格式：HH:mm
	std::string _secondODPMin{};
	int _secondODPMinMinutes{ 0 };
	//第二个ODP适应状态,取值：A-适应状态，U-未知状态
	std::string _secondODPAcclimatizedState{};
	//第二个FDP最大值,格式：HH:mm，为*表示不受限制
	std::string _secondFDPMax{};
	int _secondFDPMaxMinutes{ 0 };
	//第三个ODP最小值,格式：HH:mm
	std::string _thirdODPMin{};
	int _thirdODPMinMinutes{ 0 };
	//第二个ODP减少到最小值,格式：HH:mm
	std::string _secondODPReducedToMin{};
	int _secondODPReducedToMinMinutes{ 0 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在外站（非基地）条件
	bool MatchAwayFromHomeBase(const Duty& duty, const std::string& base) const;

	//判断Duty是否满足任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//匹配Duty和ODP范围
	bool MatchDutyAndODP(const Duty& firstODPBeforeDuty, const Duty& firstFDPDuty, const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins) const;

	//获得Standby抓飞扩展FDP
	long GetCallinSBY_FDPMins(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const;
public:

	//匹配是否满足参数
	bool MatchParam(const Duty& firstODPBeforeDuty, const Duty& firstFDPDuty, const Duty& secondFDPDuty, const Duty& thirdFDPDuty, const std::string& base, const map<long long, long>& mapCallinSBY_FDPMins) const;

	//判断计算参数_secondODPReducedToMin参数是否有效。true-有效，false-无效
	bool ValidReducedToMinRest() const;


};

#endif //_REDUCEOFFDUTYPERIODAWAYFROMBASERULEPARAM_H_
