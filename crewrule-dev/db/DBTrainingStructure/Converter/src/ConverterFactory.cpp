//
// Created by haoli on 2025/8/18.
//

#include "DBTrainingStructure/Converter/ConverterFactory.h"
#include "CrewDB.h"

ConverterFactory::ConverterFactory() {
    RegisterConverter<TrainingCourseConverterSourceType, DBTrainingCourse>();
    RegisterConverter<TrainingCourseRoleRequirementConverterSourceType, DBTrainingCourseRoleRequirement>();
    RegisterConverter<TrainingCourseRoleConverterSourceType, DBTrainingCourseRole>();
    RegisterConverter<TrainingProgramConverterSourceType, DBTrainingProgram>();
    RegisterConverter<TrainingPairingChartConverterSourceType, DBTrainingPairingChart>();
    RegisterConverter<TrainingProgramCourseConverterSourceType, DBTrainingProgramCourse>();
    RegisterConverter<TrainingDeviceConverterSourceType, DBTrainingDevice>();
    RegisterConverter<TrainingProgramCourseParticipantConverterSourceType, DBTrainingProgramCourseParticipant>();
    RegisterConverter<TrainingProgramCourseInstructorParticipantConverterSourceType, DBTrainingProgramCourseInstructorParticipant>();
    RegisterConverter<TrainingDeviceOccupiedTimeConverterSourceType , DBTrainingDeviceOccupiedTime>();
    RegisterConverter<TrainingCourseBriefConverterSourceType , DBTrainingCourseBrief>();
    RegisterConverter<TrainingCourseDurationConverterSourceType , DBTrainingCourseDuration>();
    RegisterConverter<TrainingFootprintCourseConverterSourceType , DBTrainingFootprintCourse>();
    RegisterConverter<TrainingFootprintCourseTraineeConverterSourceType , DBTrainingFootprintCourseTrainee>();
    RegisterConverter<TrainingFootprintCourseSectorConverterSourceType , DBTrainingFootprintCourseSector>();
    RegisterConverter<TrainingFootprintConverterSourceType , DBTrainingFootprint>();
    RegisterConverter<TrainingFootprintCourseIpRoleConverterSourceType, DBTrainingFootprintCourseIpRole>();
    RegisterConverter<TrainingFootprintCourseRoleConverterSourceType, DBTrainingFootprintCourseRole>();
    RegisterConverter<TrainingProgramCourseIpRoleConverterSourceType, DBTrainingProgramCourseIpRole>();
    RegisterConverter<TrainingProgramCourseRoleConverterSourceType, DBTrainingProgramCourseRole>();
}
