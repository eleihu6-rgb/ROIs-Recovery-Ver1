/**
 * @file UlrFdpClassificationMismatchForSQRule.h
 */

#ifndef _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_H_
#define _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_H_

#include <string>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "UlrFdpClassificationMismatchForSQRuleParam.h"

class UlrFdpClassificationMismatchForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_ULR_FDP_CLASSIFICATION_MISMATCH;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;

    explicit UlrFdpClassificationMismatchForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~UlrFdpClassificationMismatchForSQRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    std::vector<UlrFdpClassificationMismatchForSQRuleParam> _params{};

    void ParseParam(const InputType& input);
    bool checkDuty(const Duty* duty) const;
    void throwViolation(const Duty* duty,
                        const UlrFdpClassificationMismatchForSQRuleParam& param,
                        int fdpMinutes,
                        const std::string& sectorDep,
                        const std::string& sectorArr) const;

    static bool resolveSingleOperatingSector(const Duty& duty,
                                             std::string& sectorDep,
                                             std::string& sectorArr);
    static bool dutyMatchesFleetGroups(const Duty& duty,
                                       const std::vector<std::string>& allowedFleetGroupsUpper,
                                       const CrewDataContext* dbData);
};

#endif // _ULR_FDP_CLASSIFICATION_MISMATCH_FOR_SQ_RULE_H_
