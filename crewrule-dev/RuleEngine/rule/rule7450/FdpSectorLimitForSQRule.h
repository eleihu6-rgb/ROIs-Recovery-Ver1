/**
 * @file FdpSectorLimitForSQRule.h
 */

#ifndef _FDP_SECTOR_LIMIT_FOR_SQ_RULE_H_
#define _FDP_SECTOR_LIMIT_FOR_SQ_RULE_H_

#include <vector>
#include <string>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "FdpSectorLimitForSQRuleParam.h"

class FdpSectorLimitForSQRule : public BasicRule {
public:
    using InputType = RuleInput;
    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_FDP_SECTOR_LIMIT;
    static constexpr RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    static constexpr ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit FdpSectorLimitForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }
    ~FdpSectorLimitForSQRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const Duty* duty) const override;

private:
    struct SectorCountControl {
        std::string serviceTypeUpper{"*"};
        std::vector<std::string> fleetGroupsUpper{};
        bool countDeadheadSectors{true};
        bool excludeFinalDeadheadSectors{true};

        bool shouldCountDeadheads() const { return countDeadheadSectors; }
        bool shouldCountFinalDeadheads() const {
            return countDeadheadSectors && !excludeFinalDeadheadSectors;
        }
    };

    struct RuleInstance {
        long long ruleId{0};
        SectorCountControl control{};
        std::vector<FdpSectorLimitForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);
    bool checkDuty(const Duty* duty) const;
    bool evaluateDutyWithParam(const Duty* duty,
                                const FdpSectorLimitForSQRuleParam& param,
                                int fdpMinutes,
                                const SectorCountControl& control) const;
    int countSectorsWithinFdp(const Duty& duty, const SectorCountControl& control) const;
    static void parseControlRow(const DBRule& dbRule, SectorCountControl& control);
    static bool matchesControl(const Duty* duty,
                               const SectorCountControl& control,
                               const CrewDataContext* dbData);
    void throwViolation(const Duty* duty,
                        const FdpSectorLimitForSQRuleParam& param,
                        int actualSectors,
                        int maxAllowed,
                        int fdpMinutes,
                        const std::string& composition,
                        const std::string& fleet) const;
};

#endif // _FDP_SECTOR_LIMIT_FOR_SQ_RULE_H_
